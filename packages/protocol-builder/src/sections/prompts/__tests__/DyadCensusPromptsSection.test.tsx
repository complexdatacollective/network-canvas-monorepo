import { screen, waitFor } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import { renderStageEditor } from '../../../testing/renderStageEditor.tsx';
import DyadCensusPromptsSection from '../DyadCensusPromptsSection.tsx';

const openEditor = () => ({
  stageId: 'dyad-census-1',
  sections: <DyadCensusPromptsSection />,
});

const prompts = (stage: Record<string, unknown>): Record<string, unknown>[] =>
  Array.isArray(stage.prompts)
    ? stage.prompts.filter(
        (row: unknown): row is Record<string, unknown> =>
          typeof row === 'object' && row !== null,
      )
    : [];

describe('the questions a dyad census asks about a pair', () => {
  it('saves the stage it opened, unchanged', async () => {
    const harness = renderStageEditor(openEditor());

    await harness.roundTrip();
  });

  it('opens a prompt holding the connection it was saved with', async () => {
    const harness = renderStageEditor(openEditor());

    await harness.user.click(
      screen.getByRole('button', { name: 'Edit prompt' }),
    );

    expect(await screen.findByRole('radio', { name: 'knows' })).toBeChecked();
    expect(
      screen.getByRole('radio', { name: 'family_edge' }),
    ).not.toBeChecked();
  });

  it('refuses a prompt that creates no connection, and says which one', async () => {
    const harness = renderStageEditor(openEditor());

    await harness.user.click(
      screen.getByRole('button', { name: 'Create new prompt' }),
    );
    await harness.user.type(
      await screen.findByRole('textbox', { name: 'Prompt text' }),
      'Have these two ever worked together?',
    );
    await harness.user.click(screen.getByRole('button', { name: 'Add' }));

    expect(
      await screen.findByText(
        'Choose the type of connection an affirmative answer creates.',
      ),
    ).toBeInTheDocument();
    expect(screen.getByRole('dialog')).toBeInTheDocument();
  });

  it('adds a prompt with an identity of its own, and removes only the one chosen', async () => {
    const harness = renderStageEditor(openEditor());

    await harness.user.click(
      screen.getByRole('button', { name: 'Create new prompt' }),
    );
    await harness.user.type(
      await screen.findByRole('textbox', { name: 'Prompt text' }),
      'Have these two ever worked together?',
    );
    await harness.user.click(
      screen.getByRole('radio', { name: 'family_edge' }),
    );
    await harness.user.click(screen.getByRole('button', { name: 'Add' }));
    await screen.findByText('Have these two ever worked together?');

    const added = await harness.submit();
    const ids = prompts(added?.stageDocument ?? {}).map((row) => row.id);
    expect(ids[0]).toBe('dyad-census-prompt-1');
    expect(ids[1]).toEqual(expect.any(String));
    expect(ids[1]).not.toBe(ids[0]);

    const [firstRemove] = screen.getAllByRole('button', {
      name: 'Remove prompt',
    });
    await harness.user.click(firstRemove as HTMLElement);
    await harness.user.click(
      await screen.findByRole('button', { name: 'Remove prompt' }),
    );
    await waitFor(() =>
      expect(
        screen.queryByText('Do these two people know each other?'),
      ).not.toBeInTheDocument(),
    );

    const request = await harness.submit();
    const remaining = prompts(request?.stageDocument ?? {});
    expect(remaining).toHaveLength(1);
    expect(remaining[0]?.id).toBe(ids[1]);
    expect(remaining[0]?.createEdge).toBe('family_edge');
  });
});

/**
 * The connection type lives in the codebook rather than in the stage, so
 * creating one is a compound edit against the codebook — landing whole or not
 * at all — after which the prompt points at it as an unsaved change.
 */
describe('creating a connection type from inside a prompt', () => {
  it('asks the host once, and points the prompt at what it created', async () => {
    const harness = renderStageEditor(openEditor());
    const submit = vi.spyOn(harness.host, 'submit');

    await harness.user.click(
      screen.getByRole('button', { name: 'Edit prompt' }),
    );
    await harness.user.click(
      await screen.findByRole('button', {
        name: 'Create a new connection type',
      }),
    );
    await harness.user.type(
      await screen.findByRole('textbox', { name: 'Edge type name' }),
      'worksWith',
    );
    await harness.user.click(
      screen.getByRole('button', { name: 'Save entity' }),
    );

    expect(
      await screen.findByRole('radio', { name: 'worksWith' }),
    ).toBeChecked();
    expect(submit).toHaveBeenCalledTimes(1);
    const submission = submit.mock.calls[0]?.[0];
    expect(submission?.edits).toHaveLength(1);
    expect(submission?.edits[0]?.kind).toBe('create');
    expect(submit.mock.results[0]?.value).toMatchObject({ status: 'applied' });

    await harness.user.click(screen.getByRole('button', { name: 'Save' }));
    await waitFor(() =>
      expect(screen.queryByRole('dialog')).not.toBeInTheDocument(),
    );

    const request = await harness.submit();
    const saved = prompts(request?.stageDocument ?? {})[0];
    expect(saved?.createEdge).toEqual(expect.any(String));
    expect(saved?.createEdge).not.toBe('knows');
  });
});

describe('a codebook that changes while a dyad prompt is open', () => {
  it('offers a connection type a collaborator added, without echoing a command', async () => {
    const harness = renderStageEditor(openEditor());
    await harness.user.click(
      screen.getByRole('button', { name: 'Edit prompt' }),
    );
    await screen.findByRole('radio', { name: 'knows' });
    const dispatch = vi.spyOn(harness.session, 'dispatch');

    harness.receiveCodebookUpdate({
      edge: {
        supports: { name: 'supports', color: 'edge-color-seq-2' },
      },
    });

    expect(
      await screen.findByRole('radio', { name: 'supports' }),
    ).toBeInTheDocument();
    expect(dispatch).not.toHaveBeenCalled();
    expect(harness.pendingCommands()).toEqual([]);
    expect(screen.getByRole('radio', { name: 'knows' })).toBeChecked();
  });
});
