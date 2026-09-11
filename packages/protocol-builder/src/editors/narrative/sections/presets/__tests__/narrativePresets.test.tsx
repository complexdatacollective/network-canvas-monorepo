import { screen, waitFor, within } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import type { SectionDoc } from '@codaco/studio-sync/apply';
import { sectionId } from '@codaco/studio-sync/taxonomy';

import type { StageEditorHarness } from '../../../../../testing/renderStageEditor.tsx';
import { renderStageEditor } from '../../../../../testing/renderStageEditor.tsx';
import {
  addPreset,
  narrativeHolding,
  narrativeSections,
  openPreset,
  personWithVariable,
  presetsOf,
} from '../../../__tests__/narrativeFixtures.tsx';

const PERSON_SECTION = sectionId({ kind: 'codebookNode', typeId: 'person' });

const openEditor = () => ({
  stageId: 'narrative-1' as const,
  sections: narrativeSections,
});

describe('the ways of looking at the network a narrative stage offers', () => {
  it('saves the presets the stage opened with, unchanged', async () => {
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
      { title: 'Narrative behaviors', state: 'Finished' },
    ]);
    expect(screen.getByText('Default layout')).toBeInTheDocument();
  });

  it('renames a preset without disturbing the rest of it', async () => {
    const harness = renderStageEditor(openEditor());

    const preset = await openPreset(harness);
    const name = preset.getByRole('textbox', { name: 'Preset label' });
    await harness.user.clear(name);
    await harness.user.type(name, 'Ties');
    await harness.user.click(preset.getByRole('button', { name: 'Save' }));
    await waitFor(() =>
      expect(screen.queryByRole('dialog')).not.toBeInTheDocument(),
    );

    const saved = await harness.submit();
    expect(presetsOf(saved?.stageDocument ?? {})).toEqual([
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

    const preset = await addPreset(harness);
    await harness.user.type(
      preset.getByRole('textbox', { name: 'Preset label' }),
      'All',
    );
    await harness.user.selectOptions(
      preset.getByRole('combobox', { name: 'Layout attribute' }),
      'layout',
    );
    await harness.user.click(preset.getByRole('button', { name: 'Add' }));
    await waitFor(() =>
      expect(screen.queryByRole('dialog')).not.toBeInTheDocument(),
    );

    const saved = await harness.submit();
    const rows = presetsOf(saved?.stageDocument ?? {});
    expect(rows).toHaveLength(2);
    expect(rows[1]).toEqual({
      id: expect.any(String) as unknown as string,
      label: 'All',
      layoutVariable: 'layout',
    });
    expect(rows[1]?.id).not.toBe('narrative-preset-1');
  });

  /**
   * A preset the researcher gave nothing but its references is refused at the
   * control that is empty, rather than by the protocol schema against a path.
   */
  it('refuses a preset with no name and nothing to position it by', async () => {
    const harness = renderStageEditor(openEditor());

    const preset = await addPreset(harness);
    await harness.user.click(preset.getByRole('button', { name: 'Add' }));

    expect(
      await preset.findByText('Give this preset a name.'),
    ).toBeInTheDocument();
    expect(
      preset.getByText(
        'Choose the attribute this preset positions nodes with.',
      ),
    ).toBeInTheDocument();
    expect(screen.getByRole('dialog')).toBeInTheDocument();
  });

  it('refuses to save a narrative stage that shows nothing', async () => {
    const harness = renderStageEditor(openEditor());

    await harness.user.click(
      screen.getByRole('button', { name: 'Delete preset' }),
    );
    await harness.user.click(
      await screen.findByRole('button', { name: 'Delete preset' }),
    );
    await waitFor(() =>
      expect(screen.queryByText('Default layout')).not.toBeInTheDocument(),
    );

    expect(await harness.submit()).toBeNull();
    expect(
      await screen.findByText(/Create at least one preset/),
    ).toBeInTheDocument();
  });
});

/**
 * What a preset READS, offered whoever else writes it.
 *
 * A narrative preset stores four references and writes none of them: the
 * runtime restores positions from the layout attribute with `persist: false`,
 * reads the grouping attribute to draw hulls, and reads the highlight
 * attributes to highlight nodes. Classed as an unvalidated WRITER, the pickers
 * would run the exclusivity that keeps a bin or a stamp off an attribute a
 * form collects — and drop exactly the attributes a narrative stage exists to
 * look at.
 *
 * `flagged` is the case: the fixture's alter form collects it, which is the
 * normal way a true/false attribute about a person comes to exist. A committed
 * preset hides the omission, because a picker always offers its own value
 * back, so it shows up only on a preset being added.
 */
describe('an attribute something else already collects', () => {
  it('is offered to a new preset, because a preset only reads it', async () => {
    const harness = renderStageEditor(openEditor());

    const preset = await addPreset(harness);

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

/**
 * Both of a preset's tick lists take everything they offer from the codebook,
 * so both can be empty — and a fieldset with no boxes in it reads as an editor
 * that failed to draw rather than as a codebook with nothing to offer. The
 * released Architect disabled the whole section instead; the package says why,
 * in one sentence that serves every canvas tick list.
 */
describe('a preset’s tick lists with nothing in them', () => {
  const EMPTY_LIST =
    'Nothing to choose from yet. Create what this list offers in the codebook first.';

  it('say why, rather than rendering empty fieldsets', async () => {
    const harness = renderStageEditor(openEditor());

    // Every edge type and every attribute a preset could highlight by, gone.
    // A preset being ADDED holds no reference of its own, so neither list has
    // a lost reference to report in place of a choice.
    harness.receiveCodebookUpdate({
      edge: { knows: null, family_edge: null },
      node: { person: personWithoutHighlights(harness) },
    });

    const preset = await addPreset(harness);

    await waitFor(() =>
      expect(preset.getAllByText(EMPTY_LIST)).toHaveLength(2),
    );
    expect(preset.queryByRole('checkbox')).toBeNull();
  });
});

/**
 * The fixture's person type with every boolean attribute taken out, so the
 * preset's highlight list has nothing to offer. Written from what the protocol
 * holds rather than from a literal, so an attribute added to the fixture is
 * removed here too instead of quietly leaving the list non-empty.
 */
const personWithoutHighlights = (harness: StageEditorHarness): SectionDoc => {
  const document = harness.protocolSections()[PERSON_SECTION];
  if (document === undefined) throw new Error('the fixture has no person type');
  const held = document.variables;
  const variables =
    typeof held === 'object' && held !== null && !Array.isArray(held)
      ? (held as Record<string, Record<string, unknown>>)
      : {};
  return {
    ...document,
    variables: Object.fromEntries(
      Object.entries(variables).filter(
        ([, variable]) => variable.type !== 'boolean',
      ),
    ),
  };
};

const LOST_EDGE = 'former_edge';
const LOST_HIGHLIGHT = 'former_flag';
const LOST_EDGE_CHOICE = `${LOST_EDGE} — this edge type is no longer in the codebook`;
const LOST_HIGHLIGHT_CHOICE = `${LOST_HIGHLIGHT} — this attribute is not available here`;

/**
 * A preset naming things this protocol does not define.
 *
 * Both tick lists render from the codebook and neither value does, so an id
 * the codebook lost stayed in the preset with no box to untick it with: the
 * control writes the whole list back on any tick, so the reference survived
 * every gesture and the only way out was deleting the whole preset. The same
 * repair the sociogram's prompt editor makes, made on both of a preset's
 * lists.
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
    return { harness, preset: await openPreset(harness) };
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

    const saved = await harness.submit();
    expect(presetsOf(saved?.stageDocument ?? {})[0]).toEqual({
      id: 'narrative-preset-1',
      label: 'Default layout',
      layoutVariable: 'layout',
      edges: { display: ['knows'] },
      highlight: ['flagged'],
    });
  });
});

/**
 * An attribute a collaborator adds is THEIR change. The picker offers it
 * immediately, while a row dialog is open over the stage, because it is built
 * from the protocol rather than from anything the stage carries.
 */
describe('a codebook change made while a preset dialog is open', () => {
  /**
   * The other half of the same rule, on a tick list: an edge type ticked in
   * this dialog a moment ago and deleted by a collaborator now is a reference
   * the researcher has to be able to see and untick. Read from the committed
   * value alone it would leave the list while the id stayed in the field — a
   * dangling reference, invisible, saved.
   */
  it('keeps an edge type ticked here and deleted since, so it can be unticked', async () => {
    const harness = renderStageEditor(openEditor());

    const preset = await openPreset(harness);
    await harness.user.click(
      preset.getByRole('checkbox', { name: 'family_edge' }),
    );

    harness.receiveCodebookUpdate({ edge: { family_edge: null } });

    const lost = await preset.findByRole('checkbox', {
      name: 'family_edge \u2014 this edge type is no longer in the codebook',
    });
    expect(lost).toBeChecked();

    await harness.user.click(lost);
    await harness.user.click(preset.getByRole('button', { name: 'Save' }));
    await waitFor(() =>
      expect(screen.queryByRole('dialog')).not.toBeInTheDocument(),
    );

    const saved = await harness.submit();
    expect(presetsOf(saved?.stageDocument ?? {})[0]).toMatchObject({
      edges: { display: ['knows'] },
    });
  });

  it('reaches the position picker without the dialog asking', async () => {
    const harness = renderStageEditor(openEditor());

    const preset = await openPreset(harness);
    const picker = preset.getByRole('combobox', { name: 'Layout attribute' });
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
  });
});
