import { screen, waitFor, within } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import type { SectionDoc } from '@codaco/studio-sync/apply';
import { sectionId } from '@codaco/studio-sync/taxonomy';

import { writeInto } from '../../editors/__tests__/writeInto.ts';
import TieStrengthCensusPromptsSection from '../../editors/tie-strength-census/sections/TieStrengthCensusPromptsSection.tsx';
import {
  fixtureOptionId,
  fixtureTypeId,
  fixtureVariableId,
} from '../../testing/protocolFixture.ts';
import {
  renderStageEditor,
  type StageEditorHarness,
} from '../../testing/renderStageEditor.tsx';
import { testId } from '../../testing/testId.ts';

const KNOWS = fixtureTypeId('edge', 'knows');
const CLOSENESS = fixtureVariableId(
  { entity: 'edge', typeName: 'knows' },
  'closeness',
);

const en = (text: string) => ({ 'en-US': text });

/** The id the fixture gives the scale's point worth `value`. */
const closenessOption = (value: number) =>
  fixtureOptionId({ entity: 'edge', typeName: 'knows' }, 'closeness', value);

/**
 * The connection type whose scale the fixture's census prompt asks about, and
 * the section of the protocol that holds it.
 */
const CENSUS_EDGE = KNOWS;
const CENSUS_EDGE_SECTION = sectionId({
  kind: 'codebookEdge',
  typeId: CENSUS_EDGE,
});
const SCALE_VARIABLE = CLOSENESS;

const openSection = () => ({
  stageId: 'tie-strength-census-1' as const,
  sections: <TieStrengthCensusPromptsSection />,
});

/**
 * How many times the connection type's section has been written.
 *
 * The only way to prove that a save wrote NOTHING to the codebook: a write of
 * the same list is still a revision a collaborator has to merge, and comparing
 * the documents cannot see it.
 */
const edgeRevision = (harness: StageEditorHarness): bigint =>
  harness.host.store.read(CENSUS_EDGE_SECTION).revision.sequence;

const censusEdgeDocument = (harness: StageEditorHarness): SectionDoc => {
  const section = harness.protocolSections()[CENSUS_EDGE_SECTION];
  if (section === undefined) {
    throw new Error(
      `the fixture protocol has no "${CENSUS_EDGE}" edge type, which is the one this census's prompt asks about.`,
    );
  }
  return section;
};

/**
 * The scale as the PROTOCOL holds it now, or as the EDITOR shows it, which is
 * the protocol's with the stage's own unsaved codebook changes laid over.
 */
const scale = (
  harness: StageEditorHarness,
  reader: 'protocol' | 'editor' = 'protocol',
): Record<string, unknown> => {
  const codebook =
    reader === 'protocol' ? harness.hostCodebook() : harness.editorCodebook();
  const held = codebook.edge?.[CENSUS_EDGE]?.variables?.[SCALE_VARIABLE];
  if (held === undefined) {
    throw new Error(
      `the protocol no longer holds the "${SCALE_VARIABLE}" scale this test is about.`,
    );
  }
  return held as unknown as Record<string, unknown>;
};

/**
 * A change to the scale made by somebody else while the prompt is open.
 *
 * `patch` receives the attribute as the protocol holds it and answers with the
 * attribute as the collaborator leaves it, so a test says only what that other
 * researcher did.
 */
function collaboratorEdits(
  harness: StageEditorHarness,
  patch: (held: Record<string, unknown>) => Record<string, unknown>,
): void {
  const document = censusEdgeDocument(harness);
  const variables =
    typeof document.variables === 'object' && document.variables !== null
      ? (document.variables as Record<string, unknown>)
      : {};
  const held = variables[SCALE_VARIABLE];
  harness.receiveCodebookUpdate({
    edge: {
      [CENSUS_EDGE]: {
        ...document,
        variables: {
          ...variables,
          [SCALE_VARIABLE]: patch(
            (typeof held === 'object' && held !== null ? held : {}) as Record<
              string,
              unknown
            >,
          ),
        },
      },
    },
  });
}

/** The scale's points with one more on the end, as a collaborator adds one. */
const withAnExtraPoint = (
  held: Record<string, unknown>,
): Record<string, unknown> => ({
  ...held,
  options: [
    ...(Array.isArray(held.options) ? held.options : []),
    { id: testId('option/closeness/4'), label: en('Inseparable'), value: 4 },
  ],
});

/**
 * The list an attribute offers belongs to the codebook, and the prompt that
 * shows it inline is one of several places it can be edited from. So a save
 * made from here has to be able to say what the RESEARCHER wrote, rather than
 * writing back whatever the control was seeded with.
 */
describe('the answers a prompt writes back to its attribute', () => {
  it('writes nothing at all when the researcher left the answers alone', async () => {
    const harness = renderStageEditor(openSection());
    await harness.opened();
    const before = edgeRevision(harness);

    await harness.user.click(
      screen.getByRole('button', { name: 'Edit prompt' }),
    );
    // The list is on screen and seeded from the codebook, which is the whole
    // difficulty: the row is holding it whether or not anybody touched it.
    await screen.findByRole('region', { name: 'Choice values' });
    await writeInto(
      harness,
      await screen.findByRole('textbox', { name: 'Prompt text' }),
      'How close are these two?',
    );
    await harness.user.click(screen.getByRole('button', { name: 'Save' }));
    await waitFor(() =>
      expect(screen.queryByRole('dialog')).not.toBeInTheDocument(),
    );

    // A revision on the connection type's section is a change a collaborator
    // has to merge. A prompt's wording is not one.
    expect(edgeRevision(harness)).toBe(before);
  });

  it('leaves a point a collaborator added while the prompt was open', async () => {
    const harness = renderStageEditor(openSection());
    await harness.opened();

    await harness.user.click(
      screen.getByRole('button', { name: 'Edit prompt' }),
    );
    await screen.findByRole('region', { name: 'Choice values' });

    collaboratorEdits(harness, withAnExtraPoint);
    await waitFor(() => expect(scale(harness).options).toHaveLength(4));

    await writeInto(
      harness,
      await screen.findByRole('textbox', { name: 'Prompt text' }),
      'How close are these two?',
    );
    await harness.user.click(screen.getByRole('button', { name: 'Save' }));
    await waitFor(() =>
      expect(screen.queryByRole('dialog')).not.toBeInTheDocument(),
    );

    // The save was about the prompt's wording. The other researcher's fourth
    // point is still there.
    expect(scale(harness).options).toEqual([
      { id: closenessOption(3), label: en('Very close'), value: 3 },
      { id: closenessOption(2), label: en('Somewhat close'), value: 2 },
      { id: closenessOption(1), label: en('Not close'), value: 1 },
      {
        id: testId('option/closeness/4'),
        label: en('Inseparable'),
        value: 4,
      },
    ]);
  });

  /**
   * Both researchers edited the attribute, and this save owns the list.
   *
   * The same ownership every codebook surface in this package writes under: an
   * editor writes the properties it set and the host keeps the rest. So the
   * collaborator's RENAME survives — this prompt offered no control for it —
   * and their edit to the list itself does not, because the list is the one
   * thing this save is about.
   */
  it('writes the researcher’s own list whole, keeping what the save did not touch', async () => {
    const harness = renderStageEditor(openSection());
    await harness.opened();

    await harness.user.click(
      screen.getByRole('button', { name: 'Edit prompt' }),
    );
    const values = within(
      await screen.findByRole('region', { name: 'Choice values' }),
    );
    await harness.user.click(
      values.getByRole('button', { name: 'Edit option 1' }),
    );
    const label = await screen.findByRole('textbox', { name: 'Label' });
    await harness.user.clear(label);
    await harness.user.type(label, 'Inseparable');
    await harness.user.click(
      screen.getByRole('button', { name: 'Finish editing option' }),
    );

    collaboratorEdits(harness, (held) => ({
      ...withAnExtraPoint(held),
      name: 'tieStrength',
    }));
    await waitFor(() => expect(scale(harness).name).toBe('tieStrength'));

    await harness.user.click(screen.getByRole('button', { name: 'Save' }));
    await waitFor(() =>
      expect(screen.queryByRole('dialog')).not.toBeInTheDocument(),
    );

    // The list is the stage's draft until the stage is saved: the editor
    // shows the researcher's list with the collaborator's rename merged in,
    // and the protocol still holds what the collaborator left.
    // A relabelled point keeps its id.
    const written = [
      { id: closenessOption(3), label: en('Inseparable'), value: 3 },
      { id: closenessOption(2), label: en('Somewhat close'), value: 2 },
      { id: closenessOption(1), label: en('Not close'), value: 1 },
    ];
    await waitFor(() =>
      expect(scale(harness, 'editor').options).toEqual(written),
    );
    expect(scale(harness, 'editor').name).toBe('tieStrength');
    expect(scale(harness).options).toHaveLength(4);

    // Saving the stage writes the list whole, and keeps the rename.
    expect(await harness.submit()).not.toBeNull();
    expect(scale(harness).options).toEqual(written);
    expect(scale(harness).name).toBe('tieStrength');
  });
});
