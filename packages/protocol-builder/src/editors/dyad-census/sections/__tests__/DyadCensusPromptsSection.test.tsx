import { screen, waitFor } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import { renderStageEditor } from '../../../../testing/renderStageEditor.tsx';
import { writeInto } from '../../../__tests__/writeInto.ts';
import DyadCensusPromptsSection from '../DyadCensusPromptsSection.tsx';

const openSection = () => ({
  stageId: 'dyad-census-1' as const,
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
    const harness = renderStageEditor(openSection());

    // The stage's name, the type it asks about and the screen shown before it
    // belong to sections this mount does not include.
    await harness.roundTrip({
      unowned: ['label', 'subject', 'introductionPanel'],
    });
  });

  it('opens a prompt holding the connection it was saved with', async () => {
    const harness = renderStageEditor(openSection());

    await harness.user.click(
      screen.getByRole('button', { name: 'Edit prompt' }),
    );

    expect(await screen.findByRole('radio', { name: 'knows' })).toBeChecked();
    expect(
      screen.getByRole('radio', { name: 'family_edge' }),
    ).not.toBeChecked();
  });

  it('refuses a prompt that creates no connection, and says which one', async () => {
    const harness = renderStageEditor(openSection());

    await harness.user.click(
      screen.getByRole('button', { name: 'Create new prompt' }),
    );
    await writeInto(
      harness,
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
    const harness = renderStageEditor(openSection());

    await harness.user.click(
      screen.getByRole('button', { name: 'Create new prompt' }),
    );
    await writeInto(
      harness,
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
   * Removal is asked of a stage that already holds two prompts rather than of
   * one this test wrote itself: what it is about is which row goes, and writing
   * the second prompt is the expensive half of a journey that answers nothing
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
      await screen.findByRole('button', { name: 'Delete prompt' }),
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
 * creating one writes that section on its own — landing whole or not at all —
 * after which the prompt points at it as an unsaved change.
 */
describe('creating a connection type from inside a prompt', () => {
  /**
   * This is the codebook half of the journey and stops where the codebook does.
   * That the prompt naming the new connection type then reaches the STAGE save
   * is `DyadCensusStageEditor.test.tsx`'s, over the whole editor.
   */
  it('writes the codebook once, and points the prompt at what it created', async () => {
    const harness = renderStageEditor(openSection());
    const submit = vi.spyOn(harness.host.store, 'submit');

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
    // The codebook is where it landed, and the stage is untouched: creating a
    // type is not an edit of the stage that named it.
    expect(
      Object.values(harness.hostCodebook().edge ?? {}).map(
        (definition) => definition.name,
      ),
    ).toContain('worksWith');
    expect(submit).not.toHaveBeenCalled();
    expect(screen.getByRole('radio', { name: 'knows' })).not.toBeChecked();
  });

  /**
   * Node and edge types share one namespace, which `CodebookSchema` enforces
   * and the subject section's own create dialog has always applied.
   *
   * Judged against the edge names alone, this dialog would accept a connection
   * named like a node type and the refusal would arrive from the schema after
   * the researcher had finished it, with no name-field error to act on.
   */
  it('refuses a connection-type name a node type already uses, whatever the case', async () => {
    const harness = renderStageEditor(openSection());

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
      'Person',
    );
    await harness.user.click(
      screen.getByRole('button', { name: 'Save entity' }),
    );

    expect(
      await screen.findByText('A type named "Person" already exists.'),
    ).toBeInTheDocument();
    // Refused here rather than by the host: the codebook still holds the two
    // connection types the prompt opened with.
    expect(
      Object.values(harness.hostCodebook().edge ?? {})
        .map((definition) => definition.name)
        .toSorted(),
    ).toEqual(['family_edge', 'knows']);
  });
});

/**
 * A spectator's prompt list: readable, and unopenable.
 *
 * Which is also why the create control inside the dialog cannot be reached to
 * be asserted here — the row never opens for a researcher who may not write,
 * so its own `readOnly` guard is a second line rather than the one on screen.
 */
describe('a dyad census someone else is holding', () => {
  it('shows the questions it asks and offers no way to change them', async () => {
    const harness = renderStageEditor({
      stageId: 'dyad-census-1',
      sections: <DyadCensusPromptsSection />,
      readOnly: true,
    });
    await harness.opened();

    expect(
      screen.getByText('Do these two people know each other?'),
    ).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Edit prompt' })).toBeDisabled();
    expect(
      screen.getByRole('button', { name: 'Remove prompt' }),
    ).toBeDisabled();
    expect(
      screen.getByRole('button', { name: 'Create new prompt' }),
    ).toBeDisabled();
  });
});

/**
 * A prompt saved over a connection type the codebook no longer defines.
 *
 * The picker keeps a deleted type on offer, labelled for what it is, for the
 * reason the attribute picker keeps a deleted attribute: blanking the control
 * would hide the reference the researcher has to repair and write the blank
 * back over it. Nothing else refuses it — the field validates only that
 * something was chosen — so without the section's own gate Save closes the
 * dialog and the refusal arrives at the whole-stage save instead, in the
 * schema's words about a codebook the researcher is no longer looking at.
 */
describe('a prompt whose connection type is no longer in the codebook', () => {
  it('refuses the save, and says so on the control', async () => {
    const harness = renderStageEditor(openSection());
    await harness.user.click(
      screen.getByRole('button', { name: 'Edit prompt' }),
    );
    await screen.findByRole('radio', { name: 'knows' });

    harness.receiveCodebookUpdate({ edge: { knows: null } });
    expect(
      await screen.findByText(
        'This type is no longer in the codebook. Choose another one.',
      ),
    ).toBeInTheDocument();

    await harness.user.click(screen.getByRole('button', { name: 'Save' }));

    expect(
      await screen.findByText(
        'The connection type this prompt records is no longer in the codebook. Choose another one.',
      ),
    ).toBeInTheDocument();
    // Still open on the choice that has to be repaired, rather than closed over
    // a stage the save will refuse later.
    expect(screen.getByRole('dialog')).toBeInTheDocument();
  });
});
