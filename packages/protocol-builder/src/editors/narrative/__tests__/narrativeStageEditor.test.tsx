import { screen, waitFor, within } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import { getInterfaceTemplate } from '../../../interfaces/templates.ts';
import {
  attributeField,
  chooseAttributeById,
} from '../../../testing/attributePicker.ts';
import { renderStageEditor } from '../../../testing/renderStageEditor.tsx';
import {
  expectOpenedAsANewStage,
  NEW_STAGE_POSITION,
} from '../../__tests__/creationSignal.ts';
import { addPreset, narrativeEditor, presetsOf } from './narrativeFixtures.tsx';

const openFixture = () =>
  renderStageEditor({ stageId: 'narrative-1', editor: narrativeEditor });

/** A stage of this interface as the package's own template creates one. */
const openNewStage = () =>
  renderStageEditor({
    stage: {
      id: 'narrative-new',
      type: 'Narrative',
      fields: getInterfaceTemplate('Narrative'),
    },
    editor: narrativeEditor,
  });

describe('the narrative stage editor', () => {
  /**
   * A stage the host is CREATING, opened the way a host opens one: from this
   * interface's own template, not yet in the interview, and carrying the
   * position it is about to be inserted at.
   */
  it('opens a stage being created on the creation the host carries', async () => {
    renderStageEditor({
      create: { type: 'Narrative', position: NEW_STAGE_POSITION },
      editor: narrativeEditor,
    });

    await expectOpenedAsANewStage('Narrative');
  });

  /**
   * A new stage arrives holding what the interface's template gives it, and
   * nothing else. The two canvas behaviours are the narrative's own authored
   * defaults; a researcher who never opens that section gets the stage the
   * interface was designed around.
   *
   * Split from the save below so neither claim can hide the other: a template
   * that arrived empty would still let a filled-in stage save.
   */
  it('opens a new stage on the behaviours its template ships', async () => {
    openNewStage();

    expect(
      await screen.findByRole('switch', { name: 'Allow repositioning' }),
    ).toBeChecked();
    expect(screen.getByRole('switch', { name: 'Free-draw' })).not.toBeChecked();
  });

  /**
   * What a new stage still needs is the interface's own minimum: a name, the
   * type it draws, one way of looking at the network, and something behind the
   * nodes.
   *
   * The typed strings are as short as the assertions allow: every character is
   * a keystroke through a controlled field, and neither a stage's name nor a
   * preset's is what this case is about.
   */
  it('saves a new stage once it has been given the minimum it needs', async () => {
    const harness = openNewStage();

    const name = await screen.findByRole('textbox', { name: 'Stage name' });
    await harness.user.clear(name);
    await harness.user.type(name, 'Story');
    await harness.user.click(screen.getByRole('radio', { name: 'person' }));

    const preset = await addPreset(harness);
    await harness.user.type(
      preset.getByRole('textbox', { name: 'Preset label' }),
      'All',
    );
    await chooseAttributeById(
      harness.user,
      attributeField('Layout attribute'),
      'layout',
    );
    await harness.user.click(preset.getByRole('button', { name: 'Add' }));
    await waitFor(() =>
      expect(screen.queryByRole('dialog')).not.toBeInTheDocument(),
    );
    await harness.user.type(
      screen.getByRole('spinbutton', { name: 'Number of concentric circles' }),
      '4',
    );

    const saved = await harness.submit();
    expect(saved?.stageDocument).toMatchObject({
      label: 'Story',
      subject: { entity: 'node', type: 'person' },
      background: { concentricCircles: 4 },
    });
    expect(presetsOf(saved?.stageDocument ?? {})).toHaveLength(1);
  });

  /**
   * Automatic layout is a switch on this interface, as released Architect had
   * it — not the shared two-card layout-mode picker.
   *
   * A narrative stage is shown a network that was built elsewhere, so there is
   * no "manual mode" for it to describe: the cards' choice between placing
   * nodes by hand and simulating them is a decision the stages that COLLECT
   * positions make. What is left is one permission among the three this
   * section grants, which is why it reads first in it.
   */
  it('offers automatic layout as a switch in the behaviours section', async () => {
    const harness = openFixture();
    await waitFor(() => expect(harness.outline()).toHaveLength(7));

    expect(
      screen.queryByRole('listbox', { name: 'Layout mode' }),
    ).not.toBeInTheDocument();

    const behaviours = within(
      screen.getByRole('region', { name: 'Narrative behaviors' }),
    );
    // In Architect's order, and asserted as the whole list so a switch added
    // above this one fails here rather than passing on a name lookup.
    const switches = behaviours.getAllByRole('switch');
    expect(switches).toHaveLength(3);
    expect(switches[0]).toBe(
      behaviours.getByRole('switch', { name: 'Automatic layout' }),
    );
    expect(switches[1]).toBe(
      behaviours.getByRole('switch', { name: 'Free-draw' }),
    );
    expect(switches[2]).toBe(
      behaviours.getByRole('switch', { name: 'Allow repositioning' }),
    );
    expect(switches[0]).toHaveAccessibleDescription(
      /^Position nodes automatically using a force-directed layout\s*$/,
    );
  });

  /** Off is what the protocol says when it says nothing, and on is written. */
  it('writes the automatic-layout switch to the stage', async () => {
    const harness = openFixture();

    const layout = await screen.findByRole('switch', {
      name: 'Automatic layout',
    });
    expect(layout).toHaveAttribute('aria-checked', 'false');
    await harness.user.click(layout);

    const saved = await harness.submit();
    expect(saved?.stageDocument.behaviours).toMatchObject({
      automaticLayout: true,
      freeDraw: true,
      allowRepositioning: true,
    });
  });

  /** And a stage that arrives with it on opens with it on. */
  it('opens a stage that already arranges its nodes with the switch on', async () => {
    renderStageEditor({
      stage: {
        type: 'Narrative',
        fields: {
          label: 'Story',
          subject: { entity: 'node', type: 'person' },
          behaviours: { automaticLayout: true },
          presets: [
            { id: 'preset-1', label: 'Default', layoutVariable: 'layout' },
          ],
        },
      },
      editor: narrativeEditor,
    });

    expect(
      await screen.findByRole('switch', { name: 'Automatic layout' }),
    ).toHaveAttribute('aria-checked', 'true');
  });

  /**
   * The refusal has to be attributable: a researcher looking at the outline
   * has to be told which section is holding the save up, not only that
   * something is.
   */
  it('refuses a stage that shows the participant nothing, and says where', async () => {
    const harness = openFixture();

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
    // The outline blames exactly the section that refused, and nothing else:
    // "something is wrong somewhere" is not an account a researcher can act
    // on.
    expect(
      harness
        .outline()
        .filter((section) => section.state === 'Has a problem')
        .map((section) => section.title),
    ).toEqual(['Visualization presets']);
    expect(
      await screen.findByText(/Create at least one preset/),
    ).toBeInTheDocument();
  });
});
