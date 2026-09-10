import { screen, waitFor } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import { getInterfaceTemplate } from '../../../interfaces/templates.ts';
import { renderStageEditor } from '../../../testing/renderStageEditor.tsx';
import {
  expectOpenedAsANewStage,
  expectStatesItsPosition,
  NEW_STAGE_POSITION,
} from '../../__tests__/creationSignal.ts';
import {
  composerEditor,
  edgesOf,
  nodeFormFieldsOf,
} from './composerFixtures.tsx';

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
   * And the other way round: a stage the interview already holds says where in
   * it the researcher is. Asked here because this editor composes the shared
   * heading itself, so dropping it would leave every other case passing.
   */
  it('says where the stage sits in the interview', () => {
    openFixture();

    expectStatesItsPosition('network-composer-1');
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
      screen.getByRole('option', { name: /Automatic mode/ }),
    ).toHaveAttribute('aria-selected', 'true');
  });

  /**
   * Both sentences under the layout control are this interface's own, and the
   * shared pair they replace is not on screen.
   *
   * The shared wording is written for a stage that is GIVEN its nodes: manual
   * mode leaves every one of them in a bucket at the foot of the canvas, and
   * automatic mode is how the stage arranges them. A composer's nodes arrive
   * one at a time as the participant adds them, and the participant has a
   * layout switch of their own — so the setting decides only how the stage
   * opens.
   */
  it('describes both layout modes as a composer performs them', async () => {
    openFixture();

    expect(
      await screen.findByText(
        /Places each node where there is room for it as the participant adds it/,
      ),
    ).toBeInTheDocument();
    expect(
      screen.getByText(/Starts the stage with the simulation running/),
    ).toBeInTheDocument();
    expect(screen.queryByText(/bucket/)).not.toBeInTheDocument();
    expect(
      screen.queryByText(/simulating physical forces/),
    ).not.toBeInTheDocument();
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
    // The template's own automatic-layout default is a dependent the picker
    // can see, so the first node type chosen for this stage still asks before
    // it throws that default away.
    await harness.user.click(screen.getByRole('radio', { name: 'person' }));
    await harness.user.click(
      await screen.findByRole('button', { name: 'Choose the node type' }),
    );
    await harness.user.selectOptions(
      await screen.findByRole('combobox', {
        name: 'Attribute filled in when a node is added',
      }),
      'composerName',
    );
    await harness.user.selectOptions(
      screen.getByRole('combobox', { name: 'Position attribute' }),
      'layout',
    );
    await harness.user.type(
      screen.getByRole('spinbutton', { name: 'Number of concentric circles' }),
      '2',
    );

    const saved = await harness.submit();
    expect(saved?.stageDocument).toMatchObject({
      label: 'Build',
      subject: { entity: 'node', type: 'person' },
      quickAdd: 'composerName',
      layoutVariable: 'layout',
      background: { concentricCircles: 2 },
      behaviours: { automaticLayout: true },
    });
  });

  /**
   * The refusal has to be attributable: a researcher looking at the outline
   * has to be told which section is holding the save up, not only that
   * something is.
   */
  it('refuses a stage with nowhere to remember node positions, and says where', async () => {
    const harness = openFixture();

    await harness.user.selectOptions(
      await screen.findByRole('combobox', { name: 'Position attribute' }),
      '',
    );

    expect(await harness.submit()).toBeNull();
    expect(
      harness
        .outline()
        .filter((section) => section.state === 'Has a problem')
        .map((section) => section.title),
    ).toEqual(['Adding and arranging nodes']);
  });

  /**
   * Every key this interface's schema declares, opened in the real editor and
   * saved without a single edit.
   *
   * The fixture stage is configured one plausible way — no connections, no
   * forms, no grouping — so a key it happens not to use is a key nothing opens
   * an editor on: it survives the save untouched because no section rendered
   * it, and the round trip goes on passing while a researcher who opens that
   * stage cannot see or change something their protocol holds. `unowned` is
   * empty, so a missing section fails here.
   */
  it('is fully editable, and saves every key of a maximal stage unchanged', async () => {
    const harness = renderStageEditor({
      stage: {
        type: 'NetworkComposer',
        fields: {
          label: 'Network Composer',
          interviewScript: 'Ask them to build their network.',
          skipLogic: {
            action: 'SKIP',
            filter: {
              join: 'AND',
              rules: [
                {
                  id: 'skip-rule-1',
                  type: 'node',
                  options: { type: 'person', operator: 'EXISTS' },
                },
              ],
            },
            destination: { type: 'finish' },
          },
          subject: { entity: 'node', type: 'person' },
          quickAdd: 'composerName',
          layoutVariable: 'layout',
          convexHullVariable: 'contactType',
          background: { image: 'canvas_image' },
          behaviours: { automaticLayout: true },
          nodeForm: {
            fields: [
              {
                id: 'composer-field-1',
                variable: 'age',
                component: 'Number',
                label: 'How old are they?',
                hint: 'In years.',
                showValidationHints: true,
              },
            ],
          },
          edges: [
            {
              id: 'composer-edge-1',
              subject: { entity: 'edge', type: 'knows' },
              form: {
                fields: [
                  {
                    id: 'composer-edge-field-1',
                    variable: 'edgeNotes',
                    component: 'TextArea',
                    label: 'Anything else?',
                  },
                ],
              },
            },
          ],
        },
      },
      assets: {
        canvas_image: {
          id: 'canvas_image',
          type: 'image',
          name: 'canvas.png',
          source: 'canvas.png',
        },
      },
      editor: composerEditor,
    });

    // Every section registers its fields on mount, and the outline is built
    // from what is registered — so a mount that has not filled the outline has
    // not finished registering. The connection forms add a tenth.
    await waitFor(() => expect(harness.outline()).toHaveLength(10));

    const saved = await harness.roundTrip({ unowned: [] });
    // Read back as well as compared, so a round trip that agreed about an
    // empty document could not pass: these are the two nested lists the
    // comparison reaches into.
    expect(nodeFormFieldsOf(saved.stageDocument)).toHaveLength(1);
    expect(edgeFormFields(saved.stageDocument)).toHaveLength(1);
  });
});

const edgeFormFields = (stage: Record<string, unknown>) => {
  const entry = edgesOf(stage)[0];
  if (entry === undefined) return [];
  const form = entry.form;
  if (typeof form !== 'object' || form === null) return [];
  const fields = Reflect.get(form, 'fields');
  return Array.isArray(fields) ? fields : [];
};
