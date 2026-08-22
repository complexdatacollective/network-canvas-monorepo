import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import {
  CurrentProtocolSchema,
  type CurrentProtocol,
} from '@codaco/protocol-validation';

import { SyntheticGenerationDialog } from '../SyntheticGenerationDialog';

/**
 * The dialog's job is to turn four controls into one request and to report what
 * came back. Both halves are asserted against the generator boundary rather
 * than against the screen alone: a field that renders but is never read would
 * pass a "the input has the value I typed" test and still generate the wrong
 * batch.
 */

const generateSyntheticExport = vi.hoisted(() => vi.fn());

vi.mock('~/lib/syntheticExport/generateSyntheticExport', async (original) => ({
  ...(await original<
    typeof import('~/lib/syntheticExport/generateSyntheticExport')
  >()),
  generateSyntheticExport,
}));

const protocol: CurrentProtocol = CurrentProtocolSchema.parse({
  name: 'Field Wiring',
  schemaVersion: 8,
  codebook: {
    node: {
      person: {
        name: 'Person',
        color: 'node-color-seq-1',
        shape: { default: 'circle' },
        variables: {
          name: { name: 'name', type: 'text', component: 'Text' },
        },
      },
    },
  },
  stages: [
    {
      id: 'ng',
      type: 'NameGeneratorQuickAdd',
      label: 'Name some people',
      subject: { entity: 'node', type: 'person' },
      quickAdd: 'name',
      prompts: [{ id: 'p1', text: 'Who do you know?' }],
    },
  ],
});

function renderDialog() {
  return render(
    <SyntheticGenerationDialog
      open
      onOpenChange={vi.fn()}
      protocol={protocol}
      protocolId="protocol-1"
    />,
  );
}

const setNumber = (name: string, value: string) => {
  fireEvent.change(screen.getByRole('spinbutton', { name }), {
    target: { value },
  });
};

const clickGenerate = () =>
  fireEvent.click(screen.getByRole('button', { name: 'Generate' }));

beforeEach(() => {
  generateSyntheticExport.mockReset();
  generateSyntheticExport.mockResolvedValue({
    sessionCount: 10,
    seed: 1,
    fileName: 'Field_Wiring-synthetic-2026-08-22_10-00.zip',
    failedCount: 0,
  });
});

describe('SyntheticGenerationDialog', () => {
  it('sends every field the researcher set, and nothing they did not', async () => {
    renderDialog();

    setNumber('Number of sessions', '3');
    setNumber('Random seed', '4242');
    fireEvent.click(
      screen.getByRole('switch', { name: 'Simulate participant drop-out' }),
    );
    fireEvent.click(
      screen.getByRole('switch', { name: 'Respect skip logic and filtering' }),
    );
    clickGenerate();

    await waitFor(() =>
      expect(generateSyntheticExport).toHaveBeenCalledTimes(1),
    );
    expect(generateSyntheticExport).toHaveBeenCalledWith(
      expect.objectContaining({
        protocol,
        protocolId: 'protocol-1',
        count: 3,
        seed: 4242,
        // Both toggles default on, so a click on each is a request for off. A
        // wiring that ignored the control would send `true` here.
        simulateDropOut: false,
        respectSkipLogic: false,
      }),
    );
  });

  it('defaults to ten interviews with both behaviours on', async () => {
    renderDialog();
    clickGenerate();

    await waitFor(() =>
      expect(generateSyntheticExport).toHaveBeenCalledTimes(1),
    );
    expect(generateSyntheticExport).toHaveBeenCalledWith(
      expect.objectContaining({
        count: 10,
        simulateDropOut: true,
        respectSkipLogic: true,
      }),
    );
  });

  it('asks for no seed at all when the field is left blank, so the engine draws one', async () => {
    renderDialog();
    clickGenerate();

    await waitFor(() =>
      expect(generateSyntheticExport).toHaveBeenCalledTimes(1),
    );
    const request = generateSyntheticExport.mock.calls[0]?.[0] as
      | Record<string, unknown>
      | undefined;
    // `seed: undefined` would be a pin at "undefined" as far as the engine's
    // option parser is concerned; the key must be absent.
    expect(request).toBeDefined();
    expect(Object.hasOwn(request ?? {}, 'seed')).toBe(false);
  });

  it('reports the seed a batch used, and generates again from it', async () => {
    generateSyntheticExport.mockResolvedValue({
      sessionCount: 4,
      seed: 987654,
      fileName: 'Field_Wiring-synthetic-2026-08-22_10-00.zip',
      failedCount: 0,
    });
    renderDialog();
    clickGenerate();

    // The reported seed is the whole point of the confirmation: without it the
    // batch cannot be asked for again.
    expect(await screen.findByText(/987654/)).toBeInTheDocument();
    expect(
      screen.getByText(/Field_Wiring-synthetic-2026-08-22_10-00\.zip/),
    ).toBeInTheDocument();
    expect(screen.getByText('Generated 4 interviews')).toBeInTheDocument();

    // Round trip: the number the researcher just read, typed back in, reaches
    // the engine as a pin.
    setNumber('Random seed', '987654');
    clickGenerate();

    await waitFor(() =>
      expect(generateSyntheticExport).toHaveBeenCalledTimes(2),
    );
    expect(generateSyntheticExport).toHaveBeenLastCalledWith(
      expect.objectContaining({ seed: 987654 }),
    );
  });

  it('holds the controls and the generate action while a batch is running', async () => {
    let release: (() => void) | undefined;
    generateSyntheticExport.mockImplementation(
      () =>
        new Promise((resolve) => {
          release = () =>
            resolve({
              sessionCount: 1,
              seed: 5,
              fileName: 'a.zip',
              failedCount: 0,
            });
        }),
    );
    renderDialog();
    clickGenerate();

    const generating = await screen.findByRole('button', {
      name: 'Generating…',
    });
    expect(generating).toBeDisabled();
    expect(
      screen.getByRole('spinbutton', { name: 'Random seed' }),
    ).toBeDisabled();

    // A second attempt while the first is in flight must not start a second
    // batch — two archives with two different seeds is the failure this guards.
    fireEvent.click(generating);
    expect(generateSyntheticExport).toHaveBeenCalledTimes(1);

    release?.();
    await screen.findByText('Generated 1 interview');
  });

  it('shows a failure the researcher can act on, and keeps the form usable', async () => {
    const { SyntheticGenerationError } =
      await import('~/lib/syntheticExport/errors');
    generateSyntheticExport.mockRejectedValue(
      new SyntheticGenerationError('This protocol has validation errors.'),
    );
    renderDialog();
    clickGenerate();

    expect(
      await screen.findByText('This protocol has validation errors.'),
    ).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Generate' })).toBeEnabled();
  });
});
