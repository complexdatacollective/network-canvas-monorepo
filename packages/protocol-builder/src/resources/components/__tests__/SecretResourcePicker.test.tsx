import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';

import ProtocolField from '../../../form/ProtocolField.tsx';
import { ResourceGatewayProvider } from '../../context.tsx';
import {
  resourceFailure,
  type ProtocolBuilderResourceGateway,
  type ResourceDescriptor,
  type StagedSecret,
} from '../../gateway.ts';
import { InMemoryResourceGateway } from '../../InMemoryResourceGateway.ts';
import { overrideGateway } from '../../overrideGateway.ts';
import ResourcePickerControl from '../ResourcePickerControl.tsx';
import ResourceSecretControl from '../ResourceSecretControl.tsx';
import { renderResourceEditor } from './renderResourceEditor.tsx';

const SECRET = 'pk.eyJ1IjoicmVzZWFyY2hlciIsImEiOiJzZWNyZXQifQ';
const SECOND_SECRET = 'pk.eyJ1IjoiZmllbGR3b3JrIiwiYSI6InNlY29uZCJ9';

/** Every input's live value, which `innerHTML` alone would not show. */
const inputValues = (): string[] =>
  [...document.querySelectorAll('input')].map((input) => input.value);

async function addKey(user: ReturnType<typeof userEvent.setup>, name: string) {
  await user.click(
    await screen.findByRole('button', { name: 'Select an API key' }),
  );
  await user.type(await screen.findByLabelText('Name'), name);
  await user.type(await screen.findByLabelText('Key'), SECRET);
  await user.click(screen.getByRole('button', { name: 'Add API key' }));
}

/**
 * Fills and submits the control itself, which — unlike the picker's browser —
 * is still on screen once the key is staged. That is the only place the state
 * the control keeps between submissions can be observed at all.
 */
async function submitKey(
  user: ReturnType<typeof userEvent.setup>,
  name: string,
  value: string,
) {
  await user.type(screen.getByLabelText('Name'), name);
  await user.type(screen.getByLabelText('Key'), value);
  await user.click(screen.getByRole('button', { name: 'Add API key' }));
}

describe('the secret resource picker', () => {
  it('stores the staged id and never the key itself', async () => {
    const user = userEvent.setup();
    const gateway = new InMemoryResourceGateway();
    const { fieldValue, formValues, session } = renderResourceEditor({
      gateway,
      children: (
        <ProtocolField
          component={ResourcePickerControl}
          name="apiKey"
          label="Map provider API key"
          kind="apikey"
        />
      ),
    });

    await addKey(user, 'Mapbox key');

    // Staging has finished. What it left behind is asserted before anything
    // else, so a leak is what fails rather than a later expectation that
    // happens to notice the same wrong value.
    await waitFor(() => expect(fieldValue('apiKey')).toBeDefined());

    // Nowhere in the form the stage is saved from…
    expect(JSON.stringify(formValues())).not.toContain(SECRET);
    // …and nowhere on the page: not as text and not in markup.
    expect(document.body.textContent ?? '').not.toContain(SECRET);
    expect(document.body.innerHTML).not.toContain(SECRET);

    // Staging closed the browser, so nothing can be read off its inputs until
    // it is opened again. Reopened, it puts two empty ones back: the pair is
    // what proves this is reading live controls rather than finding none.
    await user.click(
      screen.getByRole('button', { name: 'Change the API key' }),
    );
    await screen.findByLabelText('Key');
    expect(inputValues()).toEqual(['', '']);

    // The field holds the asset id, and the session is what knows the key was
    // staged — the control reports nothing about it beyond what is on screen.
    expect(fieldValue('apiKey')).toBe('staged-resource-1');
    expect(session.getSnapshot().stagedResources).toEqual([
      {
        id: 'staged-resource-1',
        kind: 'apikey',
        name: 'Mapbox key',
        status: 'staged',
      },
    ]);
  });

  it('shows the key by the name it was given, and offers no download', async () => {
    const user = userEvent.setup();
    const gateway = new InMemoryResourceGateway();
    renderResourceEditor({
      gateway,
      children: (
        <ProtocolField
          component={ResourcePickerControl}
          name="apiKey"
          label="Map provider API key"
          kind="apikey"
        />
      ),
    });

    await addKey(user, 'Mapbox key');

    expect(await screen.findByText('Mapbox key')).toBeVisible();
    // Secret material has no bytes an editor may hand back to anyone.
    expect(
      screen.queryByRole('button', { name: 'Download this resource' }),
    ).toBeNull();
  });

  it('reports a refused key and adds it once the retry succeeds', async () => {
    const user = userEvent.setup();
    const gateway = new InMemoryResourceGateway();
    const stageSecret = vi.spyOn(gateway, 'stageSecret');
    gateway.failNext('stageSecret');
    const { fieldValue } = renderResourceEditor({
      gateway,
      children: (
        <ProtocolField
          component={ResourcePickerControl}
          name="apiKey"
          label="Map provider API key"
          kind="apikey"
        />
      ),
    });

    await addKey(user, 'Mapbox key');

    expect(
      await screen.findByText('the resource host is temporarily unavailable'),
    ).toBeVisible();

    await user.click(
      screen.getByRole('button', { name: 'Try adding the key again' }),
    );

    await waitFor(() => expect(fieldValue('apiKey')).toBe('staged-resource-1'));
    // The retry repeated the identical request, so the host staged one key
    // rather than a second copy of it.
    const requestIds = stageSecret.mock.calls.map(([call]) => call.requestId);
    expect(new Set(requestIds).size).toBe(1);
  });

  it('asks for a name and a value before staging anything', async () => {
    const user = userEvent.setup();
    const gateway = new InMemoryResourceGateway();
    const stageSecret = vi.spyOn(gateway, 'stageSecret');
    renderResourceEditor({
      gateway,
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
    await user.click(screen.getByRole('button', { name: 'Add API key' }));

    expect(await screen.findByText('Enter a name for this key.')).toBeVisible();
    expect(
      await screen.findByText('Enter the value of the key.'),
    ).toBeVisible();
    expect(stageSecret).not.toHaveBeenCalled();
  });
});

/**
 * The control on its own, which is where its own state can be seen.
 *
 * Through the picker, staging selects the key and closes the browser, so the
 * inputs and the request id the control keeps between submissions are gone
 * before anything can read them.
 */
describe('the control a key is typed into', () => {
  function renderControl(gateway: ProtocolBuilderResourceGateway) {
    const staged = vi.fn<(descriptor: ResourceDescriptor) => void>();
    render(
      <ResourceGatewayProvider gateway={gateway}>
        <ResourceSecretControl onStaged={staged} />
      </ResourceGatewayProvider>,
    );
    return staged;
  }

  /**
   * Pasting a credential is a decision about who ends up holding it, and the
   * host is the only thing that knows: the editor is handed an opaque handle
   * and never learns what promotion does with the value. So the two answers
   * are two different things to say, and the field itself has to say them —
   * a warning the researcher has to go and find is one they paste without.
   */
  it('warns that a key it will write into the protocol is readable by anyone with the file', async () => {
    const gateway = new InMemoryResourceGateway();
    renderControl(gateway);

    // The description, not the text: a hint no assistive technology ties to
    // the input is one a researcher filling the field never hears.
    expect(await screen.findByLabelText('Key')).toHaveAccessibleDescription(
      /saved inside your protocol as plain text, so anyone you give the protocol file to can read it/,
    );
  });

  it('does not warn of plain text for a host that keeps the key itself', async () => {
    const gateway = overrideGateway(new InMemoryResourceGateway(), {
      secretStorage: 'vault',
    });
    renderControl(gateway);

    const key = await screen.findByLabelText('Key');
    expect(key).toHaveAccessibleDescription(
      /kept by the host rather than saved inside your protocol/,
    );
    // Saying it anyway would be telling the researcher their key is going
    // somewhere it is not, which is its own kind of wrong.
    expect(key).not.toHaveAccessibleDescription(/plain text/);
  });

  it('is left empty the moment the host has the key', async () => {
    const user = userEvent.setup();
    const gateway = new InMemoryResourceGateway();
    const staged = renderControl(gateway);

    await submitKey(user, 'Mapbox key', SECRET);
    await waitFor(() => expect(staged).toHaveBeenCalledTimes(1));

    // Both inputs are still mounted, which is what makes their emptiness an
    // assertion rather than a query that found nothing to look at.
    expect(inputValues()).toEqual(['', '']);
    expect(document.body.innerHTML).not.toContain(SECRET);
    // Only the descriptor: the opaque handle promotion needs was captured by
    // the session where the secret was staged, and no surface here has it.
    expect(staged.mock.calls[0]?.[0]).toEqual({
      id: 'staged-resource-1',
      kind: 'apikey',
      name: 'Mapbox key',
      status: 'staged',
    });
  });

  it('gives a second key its own request rather than repeating the first', async () => {
    const user = userEvent.setup();
    const gateway = new InMemoryResourceGateway();
    const stageSecret = vi.spyOn(gateway, 'stageSecret');
    const staged = renderControl(gateway);

    await submitKey(user, 'Mapbox key', SECRET);
    await waitFor(() => expect(staged).toHaveBeenCalledTimes(1));
    await submitKey(user, 'Fieldwork key', SECOND_SECRET);
    await waitFor(() => expect(staged).toHaveBeenCalledTimes(2));

    // A request id is what makes a repeat idempotent, so reusing it for a
    // different key would answer the second one with the first one's
    // descriptor and lose the key the researcher just added.
    const requestIds = stageSecret.mock.calls.map(([call]) => call.requestId);
    expect(new Set(requestIds).size).toBe(2);
    expect(staged.mock.calls.map(([descriptor]) => descriptor)).toEqual([
      expect.objectContaining({ id: 'staged-resource-1', name: 'Mapbox key' }),
      expect.objectContaining({
        id: 'staged-resource-2',
        name: 'Fieldwork key',
      }),
    ]);
    // Two keys at the host, each with a handle of its own.
    const residue = gateway.getStagingResidue();
    expect(residue.filter((entry) => entry.startsWith('staged:'))).toEqual([
      'staged:staged-resource-1',
      'staged:staged-resource-2',
    ]);
    expect(residue.filter((entry) => entry.startsWith('secret:'))).toEqual([
      'secret:staged-secret-1',
      'secret:staged-secret-2',
    ]);
  });
});

/**
 * A request id makes a repeat safe by making it the SAME request. That is only
 * true while the request is the same: an edited key sent under the id of the
 * one before it is answered with the one before it.
 */
describe('a key edited after an uncertain failure', () => {
  /**
   * A host that staged the key and lost only its answer — the one failure
   * mode a stable request id exists for, and the only one in which the client
   * and the host disagree about what is staged.
   */
  function lossyStageSecret(inner: InMemoryResourceGateway) {
    let calls = 0;
    return overrideGateway(inner, {
      stageSecret: async (request) => {
        calls += 1;
        const staged = await inner.stageSecret(request);
        return calls === 1
          ? resourceFailure<StagedSecret>(
              'unavailable',
              'the key could not be added just now',
            )
          : staged;
      },
    });
  }

  it('settles the id it is abandoning, so the host is left holding nothing', async () => {
    const user = userEvent.setup();
    const inner = new InMemoryResourceGateway();
    const gateway = lossyStageSecret(inner);
    const staged = vi.fn<(descriptor: ResourceDescriptor) => void>();
    render(
      <ResourceGatewayProvider gateway={gateway}>
        <ResourceSecretControl onStaged={staged} />
      </ResourceGatewayProvider>,
    );

    await submitKey(user, 'Mapbox key', SECRET);
    expect(
      await screen.findByText('the key could not be added just now'),
    ).toBeVisible();

    // Correcting the key retires that request id. Nothing else in the session
    // can name what it may have staged: a descriptor the client never received
    // was never registered, so no finish and no cancel would ever reach it.
    // Repeating the identical call under that same id is what names it.
    await user.clear(screen.getByLabelText('Key'));
    await user.type(screen.getByLabelText('Key'), 'pk.corrected');

    await waitFor(() => expect(inner.getStagingResidue()).toEqual([]));
  });

  it('is added as the key the researcher entered, not the one they replaced', async () => {
    const user = userEvent.setup();
    const inner = new InMemoryResourceGateway();
    const gateway = lossyStageSecret(inner);
    const stageSecret = vi.spyOn(gateway, 'stageSecret');
    const staged = vi.fn<(descriptor: ResourceDescriptor) => void>();
    render(
      <ResourceGatewayProvider gateway={gateway}>
        <ResourceSecretControl onStaged={staged} />
      </ResourceGatewayProvider>,
    );

    await submitKey(user, 'Mapbox key', SECRET);
    expect(
      await screen.findByText('the key could not be added just now'),
    ).toBeVisible();

    // The researcher decides the key was wrong and corrects it.
    await user.clear(screen.getByLabelText('Name'));
    await user.type(screen.getByLabelText('Name'), 'Mapbox production key');
    await user.clear(screen.getByLabelText('Key'));
    await user.type(screen.getByLabelText('Key'), SECOND_SECRET);

    // Repeating the previous call is no longer what "try again" would mean.
    expect(
      screen.queryByRole('button', { name: 'Try adding the key again' }),
    ).toBeNull();

    await user.click(screen.getByRole('button', { name: 'Add API key' }));
    await waitFor(() => expect(staged).toHaveBeenCalledTimes(1));

    const requestIds = stageSecret.mock.calls.map(([call]) => call.requestId);
    expect(new Set(requestIds).size).toBe(2);
    expect(staged.mock.calls[0]?.[0]).toMatchObject({
      name: 'Mapbox production key',
    });
  });

  it('repeats the identical call when nothing was edited', async () => {
    const user = userEvent.setup();
    const gateway = new InMemoryResourceGateway();
    const stageSecret = vi.spyOn(gateway, 'stageSecret');
    const staged = vi.fn<(descriptor: ResourceDescriptor) => void>();
    gateway.failNext('stageSecret', { reason: 'unavailable', retryable: true });
    render(
      <ResourceGatewayProvider gateway={gateway}>
        <ResourceSecretControl onStaged={staged} />
      </ResourceGatewayProvider>,
    );

    await submitKey(user, 'Mapbox key', SECRET);
    await user.click(
      await screen.findByRole('button', { name: 'Try adding the key again' }),
    );
    await waitFor(() => expect(staged).toHaveBeenCalledTimes(1));

    // Still one intent, so a host that already staged it answers with what it
    // staged rather than staging a second copy of the same key.
    const requestIds = stageSecret.mock.calls.map(([call]) => call.requestId);
    expect(new Set(requestIds).size).toBe(1);
  });
});
