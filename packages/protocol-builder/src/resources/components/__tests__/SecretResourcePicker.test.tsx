import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';

import ProtocolField from '../../../form/ProtocolField.tsx';
import { ResourceGatewayProvider } from '../../context.tsx';
import type { ResourceDescriptor } from '../../gateway.ts';
import { InMemoryResourceGateway } from '../../InMemoryResourceGateway.ts';
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
  function renderControl(gateway: InMemoryResourceGateway) {
    const staged = vi.fn<(descriptor: ResourceDescriptor) => void>();
    render(
      <ResourceGatewayProvider gateway={gateway}>
        <ResourceSecretControl onStaged={staged} />
      </ResourceGatewayProvider>,
    );
    return staged;
  }

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
