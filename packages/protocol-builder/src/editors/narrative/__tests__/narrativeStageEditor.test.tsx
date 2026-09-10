import { screen, waitFor } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import { getInterfaceTemplate } from '../../../interfaces/templates.ts';
import { renderStageEditor } from '../../../testing/renderStageEditor.tsx';
import {
  expectOpenedAsANewStage,
  expectStatesItsPosition,
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
   * And the other way round: a stage the interview already holds says where in
   * it the researcher is. Asked here because this editor composes the shared
   * heading itself, so dropping it would leave every other case passing.
   */
  it('says where the stage sits in the interview', () => {
    openFixture();

    expectStatesItsPosition('narrative-1');
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
      await screen.findByRole('switch', { name: 'Allow moving nodes' }),
    ).toBeChecked();
    expect(
      screen.getByRole('switch', { name: 'Allow drawing on the canvas' }),
    ).not.toBeChecked();
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
    // The template's own automatic-layout default is something the picker can
    // see, so the first node type chosen for this stage still asks before it
    // throws that default away.
    await harness.user.click(screen.getByRole('radio', { name: 'person' }));
    await harness.user.click(
      await screen.findByRole('button', { name: 'Choose the node type' }),
    );

    const preset = await addPreset(harness);
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
   * What the editor says the stage does, checked against what the stage does.
   *
   * The narrative runtime initialises its layout with `persist: false` and
   * hands the canvas no drag handler, so a node the participant moves is never
   * written anywhere; and with automatic layout off it filters out the nodes
   * the preset's attribute holds no position for and restores the rest from
   * their stored coordinates, rather than putting every node in a bucket for
   * the participant to place. A researcher plans a study around what this page
   * tells them, so wrong copy here is a false claim about what the study
   * collects, not a typo.
   */
  it('describes moving a node as the temporary thing it is', async () => {
    const harness = openFixture();
    await waitFor(() => expect(harness.outline()).toHaveLength(9));

    expect(
      screen.getByText(/Nothing is recorded/, { exact: false }),
    ).toBeInTheDocument();
  });

  it('describes manual layout as a narrative stage performs it', async () => {
    const harness = openFixture();
    await waitFor(() => expect(harness.outline()).toHaveLength(9));

    expect(
      screen.getByText(
        /Shows every node at the position already stored in the attribute the preset positions by/,
      ),
    ).toBeInTheDocument();
    // The shared sentence belongs to the stages that COLLECT positions.
    expect(
      screen.queryByText(/bucket/, { exact: false }),
    ).not.toBeInTheDocument();
  });

  /**
   * The refusal has to be attributable: a researcher looking at the outline
   * has to be told which section is holding the save up, not only that
   * something is.
   */
  it('refuses a stage that shows the participant nothing, and says where', async () => {
    const harness = openFixture();

    await harness.user.click(
      screen.getByRole('button', { name: 'Remove preset' }),
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
