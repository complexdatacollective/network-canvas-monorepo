import { screen, waitFor, within } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import { getInterfaceTemplate } from '../../../interfaces/templates.ts';
import {
  attributeField,
  chooseAttributeById,
} from '../../../testing/attributePicker.ts';
import { loadFixtureStage } from '../../../testing/protocolFixture.ts';
import { renderStageEditor } from '../../../testing/renderStageEditor.tsx';
import {
  expectOpenedAsANewStage,
  NEW_STAGE_POSITION,
} from '../../__tests__/creationSignal.ts';
import { composerEditor } from './composerFixtures.tsx';

const openFixture = () =>
  renderStageEditor({ stageId: 'network-composer-1', editor: composerEditor });

/** A stage of this interface as the package's own template creates one. */
const openNewStage = () =>
  renderStageEditor({
    stage: {
      id: 'network-composer-new',
      type: 'NetworkComposer',
      fields: getInterfaceTemplate('NetworkComposer'),
    },
    editor: composerEditor,
  });

describe('the network composer stage editor', () => {
  /**
   * A stage the host is CREATING, opened the way a host opens one: from this
   * interface's own template, not yet in the interview, and carrying the
   * position it is about to be inserted at.
   */
  it('opens a stage being created on the creation the host carries', async () => {
    renderStageEditor({
      create: { type: 'NetworkComposer', position: NEW_STAGE_POSITION },
      editor: composerEditor,
    });

    await expectOpenedAsANewStage('Network Composer');
  });

  /**
   * A new stage arrives holding what the interface's template gives it, and
   * nothing else — here, the automatic layout the composer was designed
   * around. Split from the save below so neither claim can hide the other: a
   * template that arrived empty would still let a filled-in stage save.
   */
  it('opens a new stage on the layout mode its template ships', async () => {
    openNewStage();

    expect(
      await screen.findByRole('textbox', { name: 'Stage name' }),
    ).toHaveValue('');
    expect(
      screen.getByRole('switch', {
        name: 'Start with automatic layout switched on',
      }),
    ).toHaveAttribute('aria-checked', 'true');
  });

  /**
   * Automatic layout is a switch inside the node configuration, as released
   * Architect had it — not the shared two-card layout-mode picker.
   *
   * The shared cards are written for a stage that is GIVEN its nodes: manual
   * mode leaves every one of them in a bucket at the foot of the canvas, and
   * automatic mode is how the stage arranges them. A composer's nodes arrive
   * one at a time as the participant adds them, and the participant has a
   * layout switch of their own — so the setting decides only how the stage
   * opens, which is what the switch's own words say.
   */
  it('offers automatic layout as a switch inside the node configuration', async () => {
    openFixture();

    const group = within(
      await screen.findByRole('region', { name: 'Automatic layout' }),
    );
    expect(
      group.getByRole('switch', {
        name: 'Start with automatic layout switched on',
      }),
    ).toBeInTheDocument();
    expect(
      screen.queryByRole('listbox', { name: 'Layout mode' }),
    ).not.toBeInTheDocument();
    expect(screen.queryByText(/bucket/)).not.toBeInTheDocument();
  });

  /** The switch reaches the same key the shared picker wrote. */
  it('writes the automatic-layout switch to the stage', async () => {
    const harness = openFixture();

    await harness.user.click(
      await screen.findByRole('switch', {
        name: 'Start with automatic layout switched on',
      }),
    );

    const saved = await harness.submit();
    expect(saved?.stageDocument.behaviours).toMatchObject({
      automaticLayout: true,
    });
  });

  /**
   * A composer's own minimum: a name, the type the participant builds with,
   * somewhere to put what they type when they add one, somewhere to remember
   * where they put it, and something behind the canvas.
   */
  it('saves a new stage once it has been given the minimum it needs', async () => {
    const harness = openNewStage();

    const name = await screen.findByRole('textbox', { name: 'Stage name' });
    await harness.user.clear(name);
    await harness.user.type(name, 'Build');
    await harness.user.click(screen.getByRole('radio', { name: 'person' }));
    await screen.findByText(
      'Create or select an attribute for the quick-add form',
      { selector: 'label' },
    );
    // The field offers nothing until the subject has been chosen and its
    // attributes have arrived, so the choice waits for that rather than for the label.
    await waitFor(() =>
      expect(
        screen.queryByText(
          'This type has no free-text attributes available, so there is nothing for the quick-add box to fill in.',
        ),
      ).not.toBeInTheDocument(),
    );
    await chooseAttributeById(
      harness.user,
      attributeField('Create or select an attribute for the quick-add form'),
      'composerName',
    );
    await chooseAttributeById(
      harness.user,
      attributeField('Create or select an attribute to store node coordinates'),
      'layout',
    );
    expect(
      screen.getByRole('spinbutton', { name: 'Number of concentric circles' }),
    ).toHaveDisplayValue('4');

    const saved = await harness.submit();
    expect(saved?.stageDocument).toMatchObject({
      label: { 'en-US': 'Build' },
      subject: { entity: 'node', type: 'person' },
      quickAdd: 'composerName',
      layoutVariable: 'layout',
      background: { concentricCircles: 4 },
      behaviours: { automaticLayout: true },
    });
  });

  /**
   * The refusal has to be attributable: a researcher looking at the outline
   * has to be told which section is holding the save up, not only that
   * something is.
   */
  it('refuses a stage with nowhere to remember node positions, and says where', async () => {
    // Opened without one rather than emptied on screen: the attribute picker
    // chooses, and a researcher cannot un-choose in it — there is no blank row
    // in the window — so a stage with nowhere to remember positions is one
    // that arrived that way, which a half-written draft or an import does.
    const composer = loadFixtureStage('network-composer-1');
    const { layoutVariable: _layoutVariable, ...withoutPositions } =
      composer.fields;
    const harness = renderStageEditor({
      stage: {
        id: composer.id,
        type: 'NetworkComposer',
        fields: withoutPositions,
      },
      editor: composerEditor,
    });
    await harness.opened();

    expect(await harness.submit()).toBeNull();
    expect(
      harness
        .outline()
        .filter((section) => section.state === 'Has a problem')
        .map((section) => section.title),
    ).toEqual(['Node configuration']);
  });
});
