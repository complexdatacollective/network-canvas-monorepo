import { screen, waitFor, within } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import type { SectionDoc } from '@codaco/studio-sync/apply';

import { loadFixtureStage } from '../../../testing/protocolFixture.ts';
import { renderStageEditor } from '../../../testing/renderStageEditor.tsx';
import BackgroundSection from '../BackgroundSection.tsx';
import ComposerEdgeConfigurationSection from '../ComposerEdgeConfigurationSection.tsx';
import ComposerNodeConfigurationSection from '../ComposerNodeConfigurationSection.tsx';

const sections = (
  <>
    <ComposerNodeConfigurationSection />
    <ComposerEdgeConfigurationSection />
    <BackgroundSection allowsImage />
  </>
);

const openEditor = () => ({ stageId: 'network-composer-1', sections });

/**
 * The fixture stage plus one connection type that already carries attributes,
 * which the fixture itself has none of. What it proves is that the tick list
 * never rebuilds an entry it did not remove.
 */
const CONFIGURED_EDGE: SectionDoc = {
  id: 'composer-edge-1',
  subject: { entity: 'edge', type: 'knows' },
  form: { fields: [{ variable: 'edgeNotes', component: 'Text' }] },
};

const openWithConfiguredEdge = () => {
  const { type, fields } = loadFixtureStage('network-composer-1');
  return {
    stage: {
      id: 'network-composer-edges',
      type,
      fields: { ...fields, edges: [CONFIGURED_EDGE] },
    },
    sections,
  };
};

/**
 * The form the node inspector shows, as a stage authored elsewhere holds it.
 *
 * The fixture composer asks nothing about a node, so a stage that does has to
 * be built here — and a key nothing renders survives a save untouched, so this
 * is the only thing that can catch a missing section. Each pairing is one the
 * protocol schema accepts: `name` is text and `contactFreq` is ordinal.
 */
const CONFIGURED_NODE_FORM: SectionDoc = {
  nodeForm: {
    fields: [
      {
        id: 'composer-node-field-1',
        variable: 'name',
        component: 'Text',
        label: 'What do you call them?',
        hint: 'A first name is enough.',
      },
      {
        id: 'composer-node-field-2',
        variable: 'contactFreq',
        component: 'RadioGroup',
      },
    ],
  },
};

const openWithConfiguredForms = () => {
  const { type, fields } = loadFixtureStage('network-composer-1');
  return {
    stage: {
      id: 'network-composer-forms',
      type,
      fields: { ...fields, ...CONFIGURED_NODE_FORM, edges: [CONFIGURED_EDGE] },
    },
    sections,
  };
};

describe('what a network composer lets the participant build', () => {
  it('saves the stage it opened, unchanged', async () => {
    const harness = renderStageEditor(openEditor());

    // The stage's name and the type it composes belong to sections this
    // mount does not include.
    await harness.roundTrip({ unowned: ['label', 'subject'] });
  });

  it('saves a stage whose connections are configured, unchanged', async () => {
    const harness = renderStageEditor(openWithConfiguredEdge());

    await harness.roundTrip({ unowned: ['label', 'subject'] });
  });

  /**
   * A composer authors more than one form: the node inspector's, and one per
   * connection type it draws. Both are the researcher's work, so both have to
   * be owned by something on screen — a form no section renders is a form a
   * researcher cannot see or change, and re-saving the stage would be their
   * only warning that anything was there.
   */
  it('saves a stage whose node and connection forms are configured, unchanged', async () => {
    const harness = renderStageEditor(openWithConfiguredForms());

    const request = await harness.roundTrip({ unowned: ['label', 'subject'] });

    expect(harness.ownedKeys()).toContain('nodeForm');
    expect(request.stageDocument.nodeForm).toEqual(
      CONFIGURED_NODE_FORM.nodeForm,
    );
    expect(request.stageDocument.edges).toEqual([CONFIGURED_EDGE]);
  });

  it('shows the researcher what each of those forms asks', async () => {
    renderStageEditor(openWithConfiguredForms());

    expect(
      await screen.findByText('What do you call them?'),
    ).toBeInTheDocument();
    // The second node field has no question of its own, so it reads as the
    // attribute it records.
    expect(screen.getByText('contactFreq')).toBeInTheDocument();
    expect(
      screen.getByRole('group', { name: 'Attributes for "knows" connections' }),
    ).toBeInTheDocument();
  });

  it('lists what the stage already holds', async () => {
    const harness = renderStageEditor(openEditor());

    await waitFor(() => expect(harness.outline()).toHaveLength(4));
    expect(harness.outline().map((section) => section.title)).toEqual([
      'Adding and arranging nodes',
      'Node attributes',
      'Connections',
      'Background',
    ]);
  });

  it('groups nodes by the attribute the researcher chose', async () => {
    const harness = renderStageEditor(openEditor());

    await harness.user.selectOptions(
      await screen.findByRole('combobox', { name: 'Grouping attribute' }),
      'contactType',
    );

    const request = await harness.submit();
    expect(request?.stageDocument.convexHullVariable).toBe('contactType');
  });

  /**
   * The fixture composer says nothing about automatic layout, and a
   * researcher who never touched the toggle has decided nothing either.
   * Absence is how the schema spells that, so the save may not invent a
   * default — nor the empty `behaviours` container a leaf field assembles
   * around one.
   */
  it('writes no behaviours at all for a stage that arrived without them', async () => {
    const harness = renderStageEditor(openEditor());

    const request = await harness.submit();
    expect(Object.hasOwn(request?.stageDocument ?? {}, 'behaviours')).toBe(
      false,
    );
  });

  it('takes the key away again when automatic layout is switched back off', async () => {
    const harness = renderStageEditor(openEditor());
    const toggle = screen.getByRole('switch', {
      name: 'Start with automatic layout switched on',
    });

    await harness.user.click(toggle);
    await harness.user.click(toggle);

    const request = await harness.submit();
    expect(Object.hasOwn(request?.stageDocument ?? {}, 'behaviours')).toBe(
      false,
    );
  });

  it('starts the stage with automatic layout switched on', async () => {
    const harness = renderStageEditor(openEditor());

    await harness.user.click(
      screen.getByRole('switch', {
        name: 'Start with automatic layout switched on',
      }),
    );

    const request = await harness.submit();
    expect(request?.stageDocument.behaviours).toEqual({
      automaticLayout: true,
    });
  });

  /**
   * The control lives on the STAGE rather than on the codebook attribute, so
   * choosing the attribute cannot settle it — but the codebook's own control
   * is what the researcher already decided this attribute looks like, so it is
   * what the field starts with.
   */
  it('asks something about each node, with the control the attribute already uses', async () => {
    const harness = renderStageEditor(openEditor());

    await harness.user.click(
      screen.getByRole('switch', { name: 'Node attributes' }),
    );
    await harness.user.click(
      await screen.findByRole('button', {
        name: 'Create new node attribute field',
      }),
    );
    // Queries are scoped to the dialog: `screen` would search the whole
    // editor, computing an accessible name for every control behind the
    // dialog to answer a question about one inside it.
    const field = within(await screen.findByRole('dialog'));
    await harness.user.selectOptions(
      field.getByRole('combobox', { name: 'Attribute' }),
      'age',
    );
    await harness.user.type(
      field.getByRole('textbox', { name: 'Question' }),
      'Age?',
    );
    await harness.user.click(field.getByRole('button', { name: 'Add' }));
    await waitFor(() =>
      expect(screen.queryByRole('dialog')).not.toBeInTheDocument(),
    );

    const request = await harness.submit();
    expect(request?.stageDocument.nodeForm).toEqual({
      fields: [
        {
          id: expect.any(String) as unknown as string,
          variable: 'age',
          component: 'Number',
          label: 'Age?',
        },
      ],
    });
  });

  /**
   * A connection's form records the attributes of its OWN edge type, so each
   * ticked type is asked about separately — and its fields are written into
   * the entry that names it rather than into a list of their own.
   */
  it('asks something about each connection of one kind', async () => {
    const harness = renderStageEditor(openEditor());

    await harness.user.click(
      await screen.findByRole('checkbox', { name: 'knows' }),
    );
    await harness.user.click(
      await screen.findByRole('button', {
        name: 'Create new attribute field for "knows" connections',
      }),
    );
    const field = within(await screen.findByRole('dialog'));
    await harness.user.selectOptions(
      field.getByRole('combobox', { name: 'Attribute' }),
      'edgeNotes',
    );
    await harness.user.click(field.getByRole('button', { name: 'Add' }));
    await waitFor(() =>
      expect(screen.queryByRole('dialog')).not.toBeInTheDocument(),
    );

    const request = await harness.submit();
    expect(request?.stageDocument.edges).toEqual([
      {
        id: expect.any(String) as unknown as string,
        subject: { entity: 'edge', type: 'knows' },
        form: {
          fields: [
            {
              id: expect.any(String) as unknown as string,
              variable: 'edgeNotes',
              // The codebook renders `edgeNotes` in a multi-line box, so a
              // field for it starts there rather than at the first control the
              // schema happens to allow.
              component: 'TextArea',
            },
          ],
        },
      },
    ]);
  });

  it('gives a newly drawable connection type an identity of its own', async () => {
    const harness = renderStageEditor(openEditor());

    await harness.user.click(
      await screen.findByRole('checkbox', { name: 'knows' }),
    );

    const request = await harness.submit();
    expect(request?.stageDocument.edges).toEqual([
      {
        id: expect.any(String) as unknown as string,
        subject: { entity: 'edge', type: 'knows' },
      },
    ]);
  });

  /**
   * The entry is more than the type it names: it carries the attributes the
   * participant fills in for that connection. Rebuilding it because a
   * neighbour was ticked would throw those away.
   */
  it('leaves a configured connection type exactly as it was', async () => {
    const harness = renderStageEditor(openWithConfiguredEdge());

    await harness.user.click(
      await screen.findByRole('checkbox', { name: 'family_edge' }),
    );

    const request = await harness.submit();
    const edges = request?.stageDocument.edges;
    expect(Array.isArray(edges) ? edges[0] : undefined).toEqual(
      CONFIGURED_EDGE,
    );
    expect(Array.isArray(edges) ? edges[1] : undefined).toEqual({
      id: expect.any(String) as unknown as string,
      subject: { entity: 'edge', type: 'family_edge' },
    });
  });

  /**
   * "This stage draws no connections" is spelled by the key not being there.
   * An empty list would say something else — a capability configured and left
   * holding nothing — which is not what the researcher did.
   */
  it('leaves the key out entirely when every connection type is unticked', async () => {
    const harness = renderStageEditor(openWithConfiguredEdge());

    await harness.user.click(
      await screen.findByRole('checkbox', { name: 'knows' }),
    );

    const request = await harness.submit();
    expect(Object.hasOwn(request?.stageDocument ?? {}, 'edges')).toBe(false);
  });

  /**
   * A composer needs a position attribute, and a protocol may not have a
   * spare one. Creating it is a compound edit that lands in the codebook on
   * its own; choosing it is an ordinary unsaved change to this stage.
   */
  it('creates a position attribute without leaving the stage', async () => {
    const harness = renderStageEditor(openEditor());

    await harness.user.click(
      await screen.findByRole('button', {
        name: 'Create a new position attribute',
      }),
    );
    const creator = within(await screen.findByRole('dialog'));
    await harness.user.type(
      creator.getByRole('textbox', { name: 'Attribute name' }),
      'seats',
    );
    await harness.user.click(
      creator.getByRole('button', { name: 'Create attribute' }),
    );
    await waitFor(() =>
      expect(screen.queryByRole('dialog')).not.toBeInTheDocument(),
    );

    const picker = await screen.findByRole('combobox', {
      name: 'Position attribute',
    });
    await waitFor(() =>
      expect(screen.getByRole('option', { name: 'seats' })).toBeInTheDocument(),
    );
    const chosen = (picker as HTMLSelectElement).value;
    expect(chosen).not.toBe('layout');

    const request = await harness.submit();
    expect(request?.stageDocument.layoutVariable).toBe(chosen);
  });

  it('leaves nothing pending when the edit is abandoned', async () => {
    const harness = renderStageEditor(openEditor());

    await harness.user.click(
      await screen.findByRole('checkbox', { name: 'knows' }),
    );
    await harness.cancel();

    expect(harness.pendingCommands()).toEqual([]);
    expect(harness.session.getSnapshot().stagedResources).toEqual([]);
  });
});
