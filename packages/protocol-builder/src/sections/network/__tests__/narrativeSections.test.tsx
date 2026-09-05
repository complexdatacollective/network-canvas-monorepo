import { screen, waitFor, within } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import type { SectionDoc } from '@codaco/studio-sync/apply';
import { sectionId } from '@codaco/studio-sync/taxonomy';

import type { StageEditorHarness } from '../../../testing/renderStageEditor.tsx';
import { renderStageEditor } from '../../../testing/renderStageEditor.tsx';
import NarrativeBehavioursSection from '../NarrativeBehavioursSection.tsx';
import NarrativePresetsSection from '../NarrativePresetsSection.tsx';

const sections = (
  <>
    <NarrativePresetsSection />
    <NarrativeBehavioursSection />
  </>
);

const openEditor = () => ({ stageId: 'narrative-1', sections });

const presets = (stage: Record<string, unknown>): Record<string, unknown>[] =>
  Array.isArray(stage.presets)
    ? stage.presets.filter(
        (row): row is Record<string, unknown> =>
          typeof row === 'object' && row !== null,
      )
    : [];

/** The `person` node type, as the session currently holds it. */
const personDocument = (harness: StageEditorHarness): SectionDoc => {
  const document =
    harness.session.getSnapshot().protocolSections[
      sectionId({ kind: 'codebookNode', typeId: 'person' })
    ];
  if (document === undefined) throw new Error('the fixture has no person type');
  return document;
};

/** The same type with one more attribute, as a collaborator would send it. */
const personWithVariable = (
  harness: StageEditorHarness,
  variableId: string,
  variable: Record<string, unknown>,
): SectionDoc => {
  const document = personDocument(harness);
  const variables =
    typeof document.variables === 'object' && document.variables !== null
      ? (document.variables as Record<string, unknown>)
      : {};
  return { ...document, variables: { ...variables, [variableId]: variable } };
};

describe('the ways of looking at the network a narrative stage offers', () => {
  it('saves the stage it opened, unchanged', async () => {
    const harness = renderStageEditor(openEditor());

    // The stage's name, the type it draws and what sits behind the nodes
    // belong to sections this mount does not include.
    await harness.roundTrip({ unowned: ['label', 'subject', 'background'] });
  });

  it('lists what the stage already holds', async () => {
    const harness = renderStageEditor(openEditor());

    await waitFor(() => expect(harness.outline()).toHaveLength(2));
    expect(harness.outline()).toEqual([
      { title: 'Visualisation presets', state: 'Finished' },
      { title: 'Canvas interaction', state: 'Finished' },
    ]);
    expect(screen.getByText('Default layout')).toBeInTheDocument();
  });

  it('renames a preset without disturbing the rest of it', async () => {
    const harness = renderStageEditor(openEditor());

    await harness.user.click(
      screen.getByRole('button', { name: 'Edit preset' }),
    );
    const name = await screen.findByRole('textbox', { name: 'Preset name' });
    await harness.user.clear(name);
    await harness.user.type(name, 'Close ties');
    await harness.user.click(screen.getByRole('button', { name: 'Save' }));
    await waitFor(() =>
      expect(screen.queryByRole('dialog')).not.toBeInTheDocument(),
    );

    const request = await harness.submit();
    expect(presets(request?.stageDocument ?? {})).toEqual([
      {
        id: 'narrative-preset-1',
        label: 'Close ties',
        layoutVariable: 'layout',
        groupVariable: 'contactType',
        edges: { display: ['knows'] },
        highlight: ['flagged'],
      },
    ]);
  });

  it('adds a preset with an identity of its own', async () => {
    const harness = renderStageEditor(openEditor());

    await harness.user.click(
      screen.getByRole('button', { name: 'Create new preset' }),
    );
    await harness.user.type(
      await screen.findByRole('textbox', { name: 'Preset name' }),
      'Everyone',
    );
    await harness.user.selectOptions(
      screen.getByRole('combobox', { name: 'Position attribute' }),
      'layout',
    );
    await harness.user.click(screen.getByRole('button', { name: 'Add' }));
    await waitFor(() =>
      expect(screen.queryByRole('dialog')).not.toBeInTheDocument(),
    );

    const request = await harness.submit();
    const rows = presets(request?.stageDocument ?? {});
    expect(rows).toHaveLength(2);
    expect(rows[1]).toEqual({
      id: expect.any(String) as unknown as string,
      label: 'Everyone',
      layoutVariable: 'layout',
    });
    expect(rows[1]?.id).not.toBe('narrative-preset-1');
  });

  it('refuses to save a narrative stage that shows nothing', async () => {
    const harness = renderStageEditor(openEditor());

    await harness.user.click(
      screen.getByRole('button', { name: 'Remove preset' }),
    );
    await harness.user.click(
      await screen.findByRole('button', { name: 'Remove preset' }),
    );
    await waitFor(() =>
      expect(screen.queryByText('Default layout')).not.toBeInTheDocument(),
    );

    expect(await harness.submit()).toBeNull();
    expect(
      await screen.findByText(/Create at least one preset/),
    ).toBeInTheDocument();
  });

  it('withdraws permission to draw on the canvas', async () => {
    const harness = renderStageEditor(openEditor());

    await harness.user.click(
      screen.getByRole('switch', { name: 'Allow drawing on the canvas' }),
    );

    const request = await harness.submit();
    expect(request?.stageDocument.behaviours).toEqual({
      freeDraw: false,
      allowRepositioning: true,
    });
  });

  /**
   * An attribute a collaborator adds is THEIR change, not this session's. The
   * editor has to follow it — the picker offers it immediately, while a row
   * dialog is open over the stage — without issuing a command of its own:
   * echoing it back would write their change into this stage's pending batches
   * and save it as ours.
   */
  it('follows a codebook change made elsewhere without writing one', async () => {
    const harness = renderStageEditor(openEditor());
    const dispatch = vi.spyOn(harness.session, 'dispatch');

    await harness.user.click(
      screen.getByRole('button', { name: 'Create new preset' }),
    );
    const picker = await screen.findByRole('combobox', {
      name: 'Position attribute',
    });
    expect(
      within(picker).queryByRole('option', { name: 'seating' }),
    ).not.toBeInTheDocument();

    harness.receiveCodebookUpdate({
      node: {
        person: personWithVariable(harness, 'seating', {
          name: 'seating',
          type: 'layout',
        }),
      },
    });

    expect(
      await within(picker).findByRole('option', { name: 'seating' }),
    ).toBeInTheDocument();
    expect(dispatch).not.toHaveBeenCalled();
    expect(harness.pendingCommands()).toEqual([]);
  });
});
