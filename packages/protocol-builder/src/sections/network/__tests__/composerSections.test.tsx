import { screen, waitFor } from '@testing-library/react';
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

describe('what a network composer lets the participant build', () => {
  it('saves the stage it opened, unchanged', async () => {
    const harness = renderStageEditor(openEditor());

    await harness.roundTrip();
  });

  it('saves a stage whose connections are configured, unchanged', async () => {
    const harness = renderStageEditor(openWithConfiguredEdge());

    await harness.roundTrip();
  });

  it('lists what the stage already holds', async () => {
    const harness = renderStageEditor(openEditor());

    await waitFor(() => expect(harness.outline()).toHaveLength(3));
    expect(harness.outline().map((section) => section.title)).toEqual([
      'Adding and arranging nodes',
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
    await harness.user.type(
      await screen.findByRole('textbox', { name: 'Attribute name' }),
      'seating',
    );
    await harness.user.click(
      screen.getByRole('button', { name: 'Create attribute' }),
    );
    await waitFor(() =>
      expect(screen.queryByRole('dialog')).not.toBeInTheDocument(),
    );

    const picker = await screen.findByRole('combobox', {
      name: 'Position attribute',
    });
    await waitFor(() =>
      expect(
        screen.getByRole('option', { name: 'seating' }),
      ).toBeInTheDocument(),
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
