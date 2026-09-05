import { screen, waitFor } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import SubmitButton from '@codaco/fresco-ui/form/SubmitButton';
import type { SectionDoc } from '@codaco/studio-sync/apply';

import { getInterfaceTemplate } from '../../../interfaces/templates.ts';
import type { StageEditorComponent } from '../../../stage-editor-contract.ts';
import { renderStageEditor } from '../../../testing/renderStageEditor.tsx';
import { DyadCensusStageEditor } from '../DyadCensusStageEditor.tsx';

/**
 * The named editor as a host mounts it: the editor itself, plus the action
 * chrome the host puts in its slot. Never disabled, so that a refused save can
 * be asked for and reported rather than hidden behind an inert button.
 */
const editor: StageEditorComponent = ({ controller }) => (
  <DyadCensusStageEditor
    controller={controller}
    actions={({ formId }) => (
      <SubmitButton form={formId}>Save stage</SubmitButton>
    )}
  />
);

const openFixture = () => ({ stageId: 'dyad-census-1', editor });

const prompts = (stage: SectionDoc): Record<string, unknown>[] =>
  Array.isArray(stage.prompts)
    ? stage.prompts.filter(
        (row: unknown): row is Record<string, unknown> =>
          typeof row === 'object' && row !== null,
      )
    : [];

describe('the Dyad Census stage editor', () => {
  it('saves the stage it opened, with every key still accounted for', async () => {
    const harness = renderStageEditor(openFixture());

    await harness.roundTrip({ unowned: [] });
  });

  it('lists its sections in the order the plan standardises', async () => {
    const harness = renderStageEditor(openFixture());

    await waitFor(() => expect(harness.outline()).toHaveLength(7));
    expect(harness.outline().map((section) => section.title)).toEqual([
      'Stage name',
      'Node type',
      'Stage filter',
      'Task introduction',
      'Prompts',
      'Skip logic',
      'Interviewer guidance',
    ]);
  });

  it('saves a stage created from the interface template once it says what it asks', async () => {
    const harness = renderStageEditor({
      stage: {
        type: 'DyadCensus',
        fields: getInterfaceTemplate('DyadCensus'),
      },
      editor,
    });

    await harness.user.type(
      screen.getByRole('textbox', { name: 'Stage name' }),
      'Who knows whom',
    );
    await harness.user.click(screen.getByRole('radio', { name: 'person' }));
    await harness.user.type(
      screen.getByRole('textbox', { name: 'Introduction heading' }),
      'About to compare pairs',
    );
    await harness.user.type(
      screen.getByRole('textbox', { name: 'Introduction text' }),
      'You will see two people at a time.',
    );
    await harness.user.click(
      screen.getByRole('button', { name: 'Create new prompt' }),
    );
    await harness.user.type(
      await screen.findByRole('textbox', { name: 'Prompt text' }),
      'Do these two people know each other?',
    );
    await harness.user.click(screen.getByRole('radio', { name: 'knows' }));
    await harness.user.click(screen.getByRole('button', { name: 'Add' }));
    await waitFor(() =>
      expect(screen.queryByRole('dialog')).not.toBeInTheDocument(),
    );

    const request = await harness.submit();
    expect(request?.stageDocument).toMatchObject({
      type: 'DyadCensus',
      label: 'Who knows whom',
      subject: { entity: 'node', type: 'person' },
      introductionPanel: {
        title: 'About to compare pairs',
        text: 'You will see two people at a time.',
      },
    });
    expect(prompts(request?.stageDocument ?? {})).toEqual([
      {
        id: expect.any(String) as unknown as string,
        text: 'Do these two people know each other?',
        createEdge: 'knows',
      },
    ]);
  });

  it('refuses a stage whose introduction has no heading, and says which section', async () => {
    const harness = renderStageEditor({
      stage: {
        type: 'DyadCensus',
        fields: {
          label: 'Dyad Census',
          subject: { entity: 'node', type: 'person' },
          introductionPanel: { title: '', text: 'Something to read.' },
          prompts: [
            { id: 'prompt-a', text: 'First question', createEdge: 'knows' },
          ],
        },
      },
      editor,
    });

    expect(await harness.submit()).toBeNull();
    expect(
      screen.getByRole('textbox', { name: 'Introduction heading' }),
    ).toHaveAttribute('aria-invalid', 'true');
    await waitFor(() =>
      expect(
        harness
          .outline()
          .find((section) => section.title === 'Task introduction')?.state,
      ).toBe('Has a problem'),
    );
  });

  it('leaves nothing pending when the researcher discards the edit', async () => {
    const harness = renderStageEditor(openFixture());

    await harness.user.type(
      screen.getByRole('textbox', { name: 'Stage name' }),
      ' revised',
    );
    await harness.cancel();

    expect(harness.pendingCommands()).toEqual([]);
  });

  it('refuses to save once editing has been taken away, and says so', async () => {
    const harness = renderStageEditor(openFixture());

    harness.setReadOnly();

    expect(await harness.submit()).toBeNull();
    expect(
      screen.getByText(
        'This stage is read-only, so your changes were not saved. Take over editing and try again.',
      ),
    ).toBeInTheDocument();
    expect(harness.pendingCommands()).toEqual([]);
  });
});

/**
 * A collaborator's codebook change reaches this editor as an authoritative
 * update. Following it must not write it back: a batch echoed here would be
 * saved as this session's own edit.
 */
describe('a codebook that changes while the Dyad Census editor is open', () => {
  it('offers a connection type a collaborator added, without echoing a command', async () => {
    const harness = renderStageEditor(openFixture());
    await harness.user.click(
      screen.getByRole('button', { name: 'Edit prompt' }),
    );
    await screen.findByRole('radio', { name: 'knows' });
    const dispatch = vi.spyOn(harness.session, 'dispatch');

    harness.receiveCodebookUpdate({
      edge: {
        worksWith: { name: 'worksWith', color: 'edge-color-seq-2' },
      },
    });

    expect(
      await screen.findByRole('radio', { name: 'worksWith' }),
    ).toBeInTheDocument();
    expect(dispatch).not.toHaveBeenCalled();
    expect(harness.pendingCommands()).toEqual([]);
  });

  it('reports a connection type a collaborator removed rather than blanking the pick', async () => {
    const harness = renderStageEditor(openFixture());
    await harness.user.click(
      screen.getByRole('button', { name: 'Edit prompt' }),
    );
    await screen.findByRole('radio', { name: 'knows' });
    const dispatch = vi.spyOn(harness.session, 'dispatch');

    harness.receiveCodebookUpdate({ edge: { knows: null } });

    await waitFor(() =>
      expect(
        screen.queryByRole('radio', { name: 'knows' }),
      ).not.toBeInTheDocument(),
    );
    expect(dispatch).not.toHaveBeenCalled();
    expect(harness.pendingCommands()).toEqual([]);
  });
});

/**
 * The connection an affirmative answer creates lives in the codebook rather
 * than in the stage, so creating one from inside a prompt is a compound edit
 * against the codebook — it lands whole or not at all — after which the prompt
 * naming it is saved with the stage.
 */
describe('creating a connection type from inside the Dyad Census editor', () => {
  it('asks the host once, then saves the stage that names what it created', async () => {
    const harness = renderStageEditor(openFixture());
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
    expect(submit.mock.calls[0]?.[0].edits).toHaveLength(1);
    expect(submit.mock.calls[0]?.[0].edits[0]?.kind).toBe('create');

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
