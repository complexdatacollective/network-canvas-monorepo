import { act, screen, waitFor, within } from '@testing-library/react';
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

/** A narrative stage holding one preset of the caller's choosing. */
const narrativeHolding = (preset: Record<string, unknown>) => ({
  stage: {
    type: 'Narrative' as const,
    fields: {
      label: 'Narrative',
      subject: { entity: 'node', type: 'person' },
      background: { concentricCircles: 4, skewedTowardCenter: true },
      behaviours: { freeDraw: true, allowRepositioning: true },
      presets: [preset],
    },
  },
  sections,
});

/**
 * What a preset READS, offered whoever else writes it.
 *
 * A narrative preset stores four references and writes none of them: the
 * runtime reads positions out of the layout attribute, reads the grouping
 * attribute to draw hulls, and reads the highlight attributes to colour nodes.
 * Classed as an unvalidated WRITER, the pickers ran the exclusivity that keeps
 * a bin or a stamp off an attribute a form collects — and dropped exactly the
 * attributes a narrative stage exists to look at.
 *
 * `flagged` is the case: the fixture's alter form collects it, which is the
 * normal way a true/false attribute about a person comes to exist. A committed
 * preset hid the omission, because a picker always offers its own value back,
 * so it showed up only on a preset being added.
 */
describe('an attribute something else already collects', () => {
  it('is offered to a new preset, because a preset only reads it', async () => {
    const harness = renderStageEditor(openEditor());

    await harness.user.click(
      screen.getByRole('button', { name: 'Create new preset' }),
    );
    const preset = within(await screen.findByRole('dialog'));

    // The alter form collects this one; nothing collects the other. Both are
    // asserted, so a tick list that rendered nothing at all cannot pass as a
    // list that correctly left one out.
    expect(
      await preset.findByRole('checkbox', { name: 'flagged' }),
    ).toBeInTheDocument();
    expect(
      preset.getByRole('checkbox', { name: 'highlighted' }),
    ).toBeInTheDocument();
  });
});

const LOST_EDGE = 'former_edge';
const LOST_HIGHLIGHT = 'former_flag';
const LOST_EDGE_CHOICE = `${LOST_EDGE} — this edge type is no longer in the codebook`;
const LOST_HIGHLIGHT_CHOICE = `${LOST_HIGHLIGHT} — this attribute is not available here`;

/**
 * A preset naming things this protocol does not define.
 *
 * Both tick lists render from the codebook and neither value does, so an id
 * the codebook lost stayed in the preset with no box to untick it with:
 * `CheckboxGroupField` writes the whole list back on any tick, so the
 * reference survived every gesture and the only way out was deleting the whole
 * preset. The same repair the sociogram's prompt editor makes, made on both of
 * a preset's lists.
 */
describe('a preset naming what the codebook no longer has', () => {
  const openLostPreset = async () => {
    const harness = renderStageEditor(
      narrativeHolding({
        id: 'narrative-preset-1',
        label: 'Default layout',
        layoutVariable: 'layout',
        edges: { display: ['knows', LOST_EDGE] },
        highlight: ['flagged', LOST_HIGHLIGHT],
      }),
    );
    await harness.user.click(
      await screen.findByRole('button', { name: 'Edit preset' }),
    );
    return { harness, preset: within(await screen.findByRole('dialog')) };
  };

  it('shows both lost references, and shows them as chosen', async () => {
    const { preset } = await openLostPreset();

    expect(
      preset.getByRole('checkbox', { name: LOST_EDGE_CHOICE }),
    ).toBeChecked();
    expect(
      preset.getByRole('checkbox', { name: LOST_HIGHLIGHT_CHOICE }),
    ).toBeChecked();
  });

  it('refuses the row while they are still ticked', async () => {
    const { harness, preset } = await openLostPreset();

    await harness.user.click(preset.getByRole('button', { name: 'Save' }));

    expect(
      await preset.findByText(/is no longer in the codebook, so this preset/),
    ).toBeInTheDocument();
    expect(screen.getByRole('dialog')).toBeInTheDocument();
  });

  it('lets the researcher untick them, which repairs the preset', async () => {
    const { harness, preset } = await openLostPreset();

    await harness.user.click(
      preset.getByRole('checkbox', { name: LOST_EDGE_CHOICE }),
    );
    await harness.user.click(
      preset.getByRole('checkbox', { name: LOST_HIGHLIGHT_CHOICE }),
    );
    // Unticking must not take the box away mid-gesture: the researcher has to
    // be able to see what they have just done.
    expect(
      preset.getByRole('checkbox', { name: LOST_EDGE_CHOICE }),
    ).not.toBeChecked();
    await harness.user.click(preset.getByRole('button', { name: 'Save' }));
    await waitFor(() =>
      expect(screen.queryByRole('dialog')).not.toBeInTheDocument(),
    );

    const request = await harness.submit();
    expect(presets(request?.stageDocument ?? {})[0]).toEqual({
      id: 'narrative-preset-1',
      label: 'Default layout',
      layoutVariable: 'layout',
      edges: { display: ['knows'] },
      highlight: ['flagged'],
    });
  });
});

/**
 * An attribute a preset points at, given a different type somewhere else.
 *
 * `ProtocolSchema` V8 checks that a referenced attribute EXISTS and nothing
 * more, so every one of these saves unremarked and changes what the interview
 * does: `syncFromNodes` has no coordinates to restore from a text value,
 * `getGroupKeys` discards a boolean where it wanted a category, and the
 * highlight branch reads every nonempty string as "highlighted". The pickers
 * drop the attribute the moment the type changes — they are built from the
 * same live codebook — and that only decides what may be CHOSEN.
 *
 * So the same rule is asked in the two places a preset reaches the protocol:
 * of the row a dialog is committing, and of every row in the list when the
 * stage is saved. The second is the one that matters most: a researcher
 * editing some other section never opens the row at all.
 */
describe.each([
  { held: 'positions its nodes by', variableId: 'layout' },
  { held: 'groups its nodes by', variableId: 'contactType' },
  { held: 'highlights its nodes by', variableId: 'flagged' },
])('an attribute a preset $held, retyped elsewhere', ({ variableId }) => {
  /** The collaborator's change: same id, same name, a different kind of thing. */
  const retype = (harness: StageEditorHarness) => {
    act(() => {
      harness.receiveCodebookUpdate({
        node: {
          person: personWithVariable(harness, variableId, {
            name: variableId,
            type: 'text',
            component: 'Text',
          }),
        },
      });
    });
  };

  it('refuses the stage save while every row stays closed', async () => {
    const harness = renderStageEditor(openEditor());
    await waitFor(() => expect(harness.outline()).toHaveLength(2));

    retype(harness);

    expect(await harness.submit()).toBeNull();
    expect(
      await screen.findByText(
        /names an attribute or connection type this protocol no longer offers/,
      ),
    ).toBeInTheDocument();
  });

  it('refuses the row, and says which control holds it', async () => {
    const harness = renderStageEditor(openEditor());
    await waitFor(() => expect(harness.outline()).toHaveLength(2));

    retype(harness);
    await harness.user.click(
      screen.getByRole('button', { name: 'Edit preset' }),
    );
    const preset = within(await screen.findByRole('dialog'));
    await harness.user.click(preset.getByRole('button', { name: 'Save' }));

    expect(
      await preset.findByText(
        /is no longer the kind of attribute this control can use/,
      ),
    ).toBeInTheDocument();
    expect(screen.getByRole('dialog')).toBeInTheDocument();
  });
});

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
      { title: 'Visualization presets', state: 'Finished' },
      { title: 'Canvas interaction', state: 'Finished' },
    ]);
    expect(screen.getByText('Default layout')).toBeInTheDocument();
  });

  it('renames a preset without disturbing the rest of it', async () => {
    const harness = renderStageEditor(openEditor());

    await harness.user.click(
      screen.getByRole('button', { name: 'Edit preset' }),
    );
    // Scoped to the dialog: `screen` would compute an accessible name for
    // every control in the editor behind it to answer a question about one
    // inside it.
    const preset = within(await screen.findByRole('dialog'));
    const name = preset.getByRole('textbox', { name: 'Preset name' });
    await harness.user.clear(name);
    await harness.user.type(name, 'Ties');
    await harness.user.click(preset.getByRole('button', { name: 'Save' }));
    await waitFor(() =>
      expect(screen.queryByRole('dialog')).not.toBeInTheDocument(),
    );

    const request = await harness.submit();
    expect(presets(request?.stageDocument ?? {})).toEqual([
      {
        id: 'narrative-preset-1',
        label: 'Ties',
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
    const preset = within(await screen.findByRole('dialog'));
    await harness.user.type(
      preset.getByRole('textbox', { name: 'Preset name' }),
      'All',
    );
    await harness.user.selectOptions(
      preset.getByRole('combobox', { name: 'Position attribute' }),
      'layout',
    );
    await harness.user.click(preset.getByRole('button', { name: 'Add' }));
    await waitFor(() =>
      expect(screen.queryByRole('dialog')).not.toBeInTheDocument(),
    );

    const request = await harness.submit();
    const rows = presets(request?.stageDocument ?? {});
    expect(rows).toHaveLength(2);
    expect(rows[1]).toEqual({
      id: expect.any(String) as unknown as string,
      label: 'All',
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
