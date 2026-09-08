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

    // The stage's name, the type it asks about and the screen shown before
    // it belong to sections this mount does not include.
    await harness.roundTrip({
      unowned: ['label', 'subject', 'introductionPanel'],
    });
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
      'Worked together?',
    );
    await harness.user.click(screen.getByRole('button', { name: 'Add' }));

    expect(
      await screen.findByText(
        'Choose the type of connection an affirmative answer creates.',
      ),
    ).toBeInTheDocument();
    expect(screen.getByRole('dialog')).toBeInTheDocument();
  });

  it('adds a prompt with an identity of its own', async () => {
    const harness = renderStageEditor(openEditor());

    await harness.user.click(
      screen.getByRole('button', { name: 'Create new prompt' }),
    );
    await harness.user.type(
      await screen.findByRole('textbox', { name: 'Prompt text' }),
      'Worked together?',
    );
    await harness.user.click(
      screen.getByRole('radio', { name: 'family_edge' }),
    );
    await harness.user.click(screen.getByRole('button', { name: 'Add' }));
    await screen.findByText('Worked together?');

    const request = await harness.submit();
    const rows = prompts(request?.stageDocument ?? {});
    expect(rows[0]?.id).toBe('dyad-census-prompt-1');
    expect(rows[1]?.id).toEqual(expect.any(String));
    expect(rows[1]?.id).not.toBe(rows[0]?.id);
    expect(rows[1]?.createEdge).toBe('family_edge');
  });

  /**
   * Removal is asked of a stage that already holds two prompts, rather than of
   * one this test wrote itself: what it is about is which row goes, and the
   * writing above is the expensive half of the journey that answers nothing
   * here.
   */
  it('removes only the prompt the researcher chose', async () => {
    const harness = renderStageEditor({
      stage: {
        type: 'DyadCensus',
        fields: {
          label: 'Dyad Census',
          subject: { entity: 'node', type: 'person' },
          introductionPanel: { title: 'Pairs', text: 'Two at a time.' },
          prompts: [
            { id: 'prompt-a', text: 'Know each other?', createEdge: 'knows' },
            {
              id: 'prompt-b',
              text: 'Worked together?',
              createEdge: 'family_edge',
            },
          ],
        },
      },
      sections: <DyadCensusPromptsSection />,
    });

    const [firstRemove] = screen.getAllByRole('button', {
      name: 'Remove prompt',
    });
    await harness.user.click(firstRemove as HTMLElement);
    await harness.user.click(
      await screen.findByRole('button', { name: 'Remove prompt' }),
    );
    await waitFor(() =>
      expect(screen.queryByText('Know each other?')).not.toBeInTheDocument(),
    );

    const request = await harness.submit();
    const remaining = prompts(request?.stageDocument ?? {});
    expect(remaining).toHaveLength(1);
    expect(remaining[0]?.id).toBe('prompt-b');
    expect(remaining[0]?.createEdge).toBe('family_edge');
  });
});

/**
 * The connection type lives in the codebook rather than in the stage, so
 * creating one is a compound edit against the codebook — landing whole or not
 * at all — after which the prompt points at it as an unsaved change.
 */
describe('creating a connection type from inside a prompt', () => {
  /**
   * This is the codebook half of the journey and stops where the codebook
   * does. That the prompt naming the new connection type then reaches the
   * STAGE save is `DyadCensusStageEditor.test.tsx`'s, over the whole editor.
   */
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

    // The prompt is pointing at it rather than at the one it opened on, as an
    // unsaved change: nothing has been staged against the stage.
    expect(screen.getByRole('radio', { name: 'knows' })).not.toBeChecked();
    expect(harness.pendingCommands()).toEqual([]);
  });
});

/**
 * Editing taken away while a prompt is OPEN, which is the only way a read-only
 * session ever sees the inside of one — and so the only way `CreateEdgeField`'s
 * guard can be told apart from a spectator who could never open the prompt.
 */
describe('a dyad prompt open when editing is taken away', () => {
  it('takes the connection-type control out of it', async () => {
    const harness = renderStageEditor(openEditor());

    await harness.user.click(
      screen.getByRole('button', { name: 'Edit prompt' }),
    );
    expect(
      await screen.findByRole('button', {
        name: 'Create a new connection type',
      }),
    ).toBeInTheDocument();

    harness.setReadOnly();

    await waitFor(() =>
      expect(
        screen.queryByRole('button', { name: 'Create a new connection type' }),
      ).not.toBeInTheDocument(),
    );
    // Still open and still readable: only the control that would write the
    // codebook is gone.
    expect(screen.getByRole('dialog')).toBeInTheDocument();
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

/**
 * A dismissal while the connection type is being created.
 *
 * The request outlives the dialog: dismissed mid-flight the editor is
 * unmounted, but the handler awaiting the host is still alive, so a refusal is
 * shown to nobody and a success still points the prompt at a type the
 * researcher watched no editor finish. `SubjectSection`'s own create dialog
 * withholds every way out for exactly this, and this is the same act.
 */
describe('dismissing the connection-type dialog while it is submitting', () => {
  /** Holds the compound edit open, and hands back the release. */
  const holdTheCompoundEdit = (
    harness: ReturnType<typeof renderStageEditor>,
  ) => {
    const send = harness.session.requestCompoundEdit.bind(harness.session);
    let release: () => void = () => undefined;
    const held = new Promise<void>((resolve) => {
      release = resolve;
    });
    vi.spyOn(harness.session, 'requestCompoundEdit').mockImplementation(
      async (request) => {
        await held;
        return send(request);
      },
    );
    return () => {
      release();
    };
  };

  const startTheCreate = async (
    harness: ReturnType<typeof renderStageEditor>,
  ) => {
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
  };

  it('refuses every way out until the request has answered', async () => {
    const harness = renderStageEditor(openEditor());
    const release = holdTheCompoundEdit(harness);
    await startTheCreate(harness);

    // Escape and a press outside are the two routes the researcher has left —
    // Cancel disables itself — and both reach the dialog through `closeDialog`.
    await harness.user.keyboard('{Escape}');
    await harness.user.click(document.body);
    expect(
      screen.getByRole('textbox', { name: 'Edge type name' }),
    ).toBeInTheDocument();
    // …and the one that is a visible control is not offered at all, rather
    // than offered and inert.
    expect(screen.queryAllByRole('button', { name: 'Close' })).toHaveLength(0);

    release();
    expect(
      await screen.findByRole('radio', { name: 'worksWith' }),
    ).toBeChecked();
  });

  /**
   * And the way out comes back. A refusal that outlived the request would
   * leave the researcher shut inside a dialog with nothing left to wait for.
   */
  it('can be dismissed again once the request has failed', async () => {
    const harness = renderStageEditor(openEditor());
    vi.spyOn(harness.session, 'requestCompoundEdit').mockResolvedValue({
      status: 'failed',
      reason: 'host-error',
      message: 'expected object, received undefined',
    });
    await startTheCreate(harness);
    await screen.findByRole('alert');

    await harness.user.click(screen.getByRole('button', { name: 'Cancel' }));
    await waitFor(() =>
      expect(
        screen.queryByRole('textbox', { name: 'Edge type name' }),
      ).not.toBeInTheDocument(),
    );
  });
});
