import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';

import ProtocolField from '../../../form/ProtocolField.tsx';
import { InMemoryResourceGateway } from '../../InMemoryResourceGateway.ts';
import ResourcePickerControl from '../ResourcePickerControl.tsx';
import { renderResourceEditor } from './renderResourceEditor.tsx';

const SECRET = 'pk.eyJ1IjoicmVzZWFyY2hlciIsImEiOiJzZWNyZXQifQ';

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
    // …and nowhere on the page: not as text, not in markup, and not left
    // sitting in the control it was typed into.
    expect(document.body.textContent ?? '').not.toContain(SECRET);
    expect(document.body.innerHTML).not.toContain(SECRET);
    expect(inputValues()).not.toContain(SECRET);

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
