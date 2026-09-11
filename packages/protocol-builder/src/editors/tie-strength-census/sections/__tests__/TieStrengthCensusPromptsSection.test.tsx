import { act, screen, waitFor, within } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import type { SectionDoc } from '@codaco/studio-sync/apply';
import { sectionId } from '@codaco/studio-sync/taxonomy';

import {
  renderStageEditor,
  type StageEditorHarness,
} from '../../../../testing/renderStageEditor.tsx';
import { writeInto } from '../../../__tests__/writeInto.ts';
import TieStrengthCensusPromptsSection from '../TieStrengthCensusPromptsSection.tsx';

const openSection = () => ({
  stageId: 'tie-strength-census-1' as const,
  sections: <TieStrengthCensusPromptsSection />,
});

const prompts = (stage: Record<string, unknown>): Record<string, unknown>[] =>
  Array.isArray(stage.prompts)
    ? stage.prompts.filter(
        (row: unknown): row is Record<string, unknown> =>
          typeof row === 'object' && row !== null,
      )
    : [];

/** Adds one value to the attribute editor that is open. */
async function addOption(
  harness: StageEditorHarness,
  position: number,
  label: string,
  value: number,
) {
  await harness.user.click(
    screen.getByRole('button', { name: 'Create new option' }),
  );
  await harness.user.type(
    await screen.findByRole('textbox', { name: `Option ${position} label` }),
    label,
  );
  await harness.user.type(
    screen.getByRole('textbox', { name: `Option ${position} value` }),
    String(value),
  );
}

describe('the questions a tie-strength census asks about a pair', () => {
  it('saves the stage it opened, unchanged', async () => {
    const harness = renderStageEditor(openSection());

    // The stage's name, the type it asks about and the screen shown before it
    // belong to sections this mount does not include.
    await harness.roundTrip({
      unowned: ['label', 'subject', 'introductionPanel'],
    });
  });

  it('opens a prompt holding everything it was saved with', async () => {
    const harness = renderStageEditor(openSection());

    await harness.user.click(
      screen.getByRole('button', { name: 'Edit prompt' }),
    );

    expect(await screen.findByRole('radio', { name: 'knows' })).toBeChecked();
    // The scale is the CONNECTION's attribute, not the person's.
    const picker = screen.getByRole('combobox', { name: 'Ordinal attribute' });
    expect(
      [...picker.querySelectorAll('option')]
        .map((option) => option.value)
        .filter((value) => value !== ''),
    ).toEqual(['closeness']);
    expect(picker).toHaveValue('closeness');
    expect(
      screen.getByRole('textbox', { name: 'Decline option' }),
    ).toHaveTextContent("Don't know each other");
  });

  /**
   * The scale belongs to the connection, so there is nothing to choose from
   * until the connection type is known.
   */
  it('offers no scale until the connection type is chosen', async () => {
    const harness = renderStageEditor(openSection());

    await harness.user.click(
      screen.getByRole('button', { name: 'Create new prompt' }),
    );
    await screen.findByRole('radio', { name: 'knows' });
    expect(
      screen.queryByRole('combobox', { name: 'Ordinal attribute' }),
    ).not.toBeInTheDocument();

    await harness.user.click(
      screen.getByRole('radio', { name: 'family_edge' }),
    );

    // And it offers that connection type's own ordinal attributes; a
    // `family_edge` has none, so the picker says so rather than offering the
    // person's.
    expect(
      await screen.findByText(
        'This connection type has no ordinal attributes yet. Create one to say what the scale is.',
      ),
    ).toBeInTheDocument();
  });

  /**
   * The scale names an attribute OF the connection type, so changing the
   * connection type leaves the prompt naming an attribute the new one does not
   * have.
   *
   * Left in place it is unsaveable and unexplained: the picker keeps the stale
   * pick on offer as one that is not available here — all it can say, and it
   * does not say where the attribute went, which is nowhere: it belongs to the
   * other connection type. Cleared, the prompt says what it needs, in the
   * dialog the researcher is still in.
   */
  it('clears the scale when the connection type changes under it', async () => {
    const harness = renderStageEditor(openSection());

    await harness.user.click(
      screen.getByRole('button', { name: 'Edit prompt' }),
    );
    expect(
      await screen.findByRole('combobox', { name: 'Ordinal attribute' }),
    ).toHaveValue('closeness');

    await harness.user.click(
      screen.getByRole('radio', { name: 'family_edge' }),
    );

    // The new connection type has no ordinal attributes at all, so the picker
    // has nothing to offer and nothing left over from the old one.
    await waitFor(() =>
      expect(
        screen.queryByRole('option', { name: /closeness/ }),
      ).not.toBeInTheDocument(),
    );

    // And the prompt refuses here, naming the pick it is missing, rather than
    // being accepted and refused by the stage save.
    await harness.user.click(screen.getByRole('button', { name: 'Save' }));
    expect(
      await screen.findByText(
        'Choose the attribute the participant answers on.',
      ),
    ).toBeInTheDocument();
    expect(screen.getByRole('dialog')).toBeInTheDocument();
  });

  /**
   * The other side of the same rule: reopening a prompt is not a change of
   * connection type, so the scale it was saved with survives being looked at.
   */
  it('keeps the scale when the connection type is left alone', async () => {
    const harness = renderStageEditor(openSection());

    await harness.user.click(
      screen.getByRole('button', { name: 'Edit prompt' }),
    );
    await screen.findByRole('combobox', { name: 'Ordinal attribute' });
    await harness.user.click(screen.getByRole('button', { name: 'Save' }));
    await waitFor(() =>
      expect(screen.queryByRole('dialog')).not.toBeInTheDocument(),
    );

    const request = await harness.submit();
    expect(prompts(request?.stageDocument ?? {})[0]).toMatchObject({
      createEdge: 'knows',
      edgeVariable: 'closeness',
    });
  });

  it('refuses a prompt with no way to decline, and says which one', async () => {
    const harness = renderStageEditor(openSection());

    await harness.user.click(
      screen.getByRole('button', { name: 'Create new prompt' }),
    );
    await writeInto(
      harness,
      await screen.findByRole('textbox', { name: 'Prompt text' }),
      'How much trust?',
    );
    await harness.user.click(screen.getByRole('radio', { name: 'knows' }));
    await harness.user.selectOptions(
      await screen.findByRole('combobox', { name: 'Ordinal attribute' }),
      'closeness',
    );
    await harness.user.click(screen.getByRole('button', { name: 'Add' }));

    expect(
      await screen.findByText(
        'Write how the participant says there is no connection.',
      ),
    ).toBeInTheDocument();
    expect(screen.getByRole('dialog')).toBeInTheDocument();
  });

  it('saves a whole new prompt with its own identity', async () => {
    const harness = renderStageEditor(openSection());

    await harness.user.click(
      screen.getByRole('button', { name: 'Create new prompt' }),
    );
    await writeInto(
      harness,
      await screen.findByRole('textbox', { name: 'Prompt text' }),
      'How much trust?',
    );
    await harness.user.click(screen.getByRole('radio', { name: 'knows' }));
    await harness.user.selectOptions(
      await screen.findByRole('combobox', { name: 'Ordinal attribute' }),
      'closeness',
    );
    await writeInto(
      harness,
      screen.getByRole('textbox', { name: 'Decline option' }),
      'Not at all',
    );
    await harness.user.click(screen.getByRole('button', { name: 'Add' }));
    await waitFor(() =>
      expect(screen.queryByRole('dialog')).not.toBeInTheDocument(),
    );

    const request = await harness.submit();
    const rows = prompts(request?.stageDocument ?? {});
    expect(rows).toHaveLength(2);
    expect(rows[0]?.id).toBe('tie-strength-census-prompt-1');
    expect(rows[1]).toEqual({
      id: expect.any(String) as unknown as string,
      text: 'How much trust?',
      createEdge: 'knows',
      edgeVariable: 'closeness',
      negativeLabel: 'Not at all',
    });
  });

  it('discards an edit the researcher cancelled', async () => {
    const harness = renderStageEditor(openSection());

    await harness.user.click(
      screen.getByRole('button', { name: 'Edit prompt' }),
    );
    await writeInto(
      harness,
      await screen.findByRole('textbox', { name: 'Decline option' }),
      'Never met',
    );
    await harness.user.click(screen.getByRole('button', { name: 'Cancel' }));
    await harness.user.click(
      await screen.findByRole('button', { name: 'Discard changes' }),
    );
    await waitFor(() =>
      expect(screen.queryByRole('dialog')).not.toBeInTheDocument(),
    );

    await harness.roundTrip({
      unowned: ['label', 'subject', 'introductionPanel'],
    });
  });
});

/**
 * Both of this prompt's codebook picks can be invented from inside it, and
 * each lands in the codebook on its own before the prompt is pointed at it.
 */
describe('creating a scale from inside a tie-strength prompt', () => {
  /**
   * The scale hangs off the connection, so it is created on the CONNECTION
   * TYPE's own section — not the stage's and not the person's.
   *
   * A nested codebook dialog is also a form INSIDE the prompt's form, so
   * saving it would submit the prompt around it and close the row. What stops
   * that is the `stopPropagation` each codebook editor puts on its own submit,
   * and this is one of the cases that says the fix is still in place.
   */
  it('writes the connection type’s own section, and leaves the prompt open', async () => {
    const harness = renderStageEditor(openSection());

    await harness.user.click(
      screen.getByRole('button', { name: 'Edit prompt' }),
    );
    await screen.findByRole('combobox', { name: 'Ordinal attribute' });
    expect(screen.queryAllByRole('dialog')).toHaveLength(1);

    await harness.user.click(
      screen.getByRole('button', { name: 'Create a new attribute' }),
    );
    await harness.user.type(
      await screen.findByRole('textbox', { name: 'Attribute name' }),
      'trust',
    );
    await addOption(harness, 1, 'Some', 1);
    await addOption(harness, 2, 'Lots', 2);
    await harness.user.click(
      screen.getByRole('button', { name: 'Create attribute' }),
    );

    const picker = await screen.findByRole('combobox', {
      name: 'Ordinal attribute',
    });
    await waitFor(() =>
      expect(
        within(picker).getByRole('option', { name: 'trust' }),
      ).toBeInTheDocument(),
    );
    // The prompt is pointing at it rather than at the scale it opened on, and
    // the row dialog it was created from is still the only dialog on screen.
    expect(
      within(picker).getByRole('option', { selected: true }),
    ).toHaveTextContent('trust');
    expect(screen.queryAllByRole('dialog')).toHaveLength(1);

    // The connection type is where it landed, not the person and not the stage.
    expect(
      Object.values(harness.hostCodebook().edge?.knows?.variables ?? {}).map(
        (variable) => variable.name,
      ),
    ).toContain('trust');
    expect(
      Object.values(harness.hostCodebook().node?.person?.variables ?? {}).map(
        (variable) => variable.name,
      ),
    ).not.toContain('trust');
  });
});

/**
 * A prompt saved over a scale the codebook no longer offers.
 *
 * The picker keeps a stored pick on offer whatever becomes of it, so that
 * reopening a prompt never loses the reference the researcher has to repair —
 * which means the only thing that can refuse a deleted or retyped attribute is
 * a save.
 */
describe('a tie-strength prompt whose scale has gone', () => {
  it('refuses the save, and says so on the picker', async () => {
    const harness = renderStageEditor(openSection());
    await harness.user.click(
      screen.getByRole('button', { name: 'Edit prompt' }),
    );
    await screen.findByRole('combobox', { name: 'Ordinal attribute' });

    harness.receiveCodebookUpdate({
      edge: {
        knows: { name: 'knows', color: 'edge-color-seq-1', variables: {} },
      },
    });
    expect(
      await screen.findByText(
        'closeness — this attribute is not available here',
      ),
    ).toBeInTheDocument();

    await harness.user.click(screen.getByRole('button', { name: 'Save' }));

    expect(
      await screen.findByText(
        'This attribute can no longer be the scale for this connection. Choose another one.',
      ),
    ).toBeInTheDocument();
    expect(screen.getByRole('dialog')).toBeInTheDocument();
  });
});

const PEDIGREE_SECTION = sectionId({
  kind: 'stage',
  stageId: 'family-pedigree-1',
});
const CENSUS_EDGE = 'knows';
const CENSUS_EDGE_SECTION = sectionId({
  kind: 'codebookEdge',
  typeId: CENSUS_EDGE,
});
const PEDIGREE_EDGE_SECTION = sectionId({
  kind: 'codebookEdge',
  typeId: 'family_edge',
});
const SCALE_VARIABLE = 'closeness';

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

const variablesOf = (section: Readonly<SectionDoc> | undefined): SectionDoc =>
  isRecord(section?.variables) ? section.variables : {};

/**
 * The protocol's Family Pedigree, recording its relationships as the
 * connection type this census asks about, and taking this prompt's scale as
 * the attribute that says whether a relationship is current.
 *
 * A pedigree slot is claimed OUTRIGHT: the interface derives that attribute
 * from the tree the participant draws, so a second writer would go on
 * overwriting it. Nothing says what KIND of attribute a slot may claim —
 * `edgeConfig.isActiveVariable` declares no `requireType` — so a protocol can
 * hand an ordinal scale to the pedigree and leave a census prompt pointing at
 * the same attribute.
 *
 * The pedigree's own attributes travel with it onto the connection type it now
 * records, so the slots it keeps name attributes that exist.
 */
function pedigreeClaimsTheScale(harness: StageEditorHarness): void {
  const sections = harness.protocolSections();
  const pedigree = sections[PEDIGREE_SECTION];
  const edgeConfig = isRecord(pedigree?.edgeConfig)
    ? pedigree.edgeConfig
    : undefined;
  const censusEdge = sections[CENSUS_EDGE_SECTION];
  if (pedigree === undefined || edgeConfig === undefined) {
    throw new Error(
      'the fixture protocol has no "family-pedigree-1" stage with an edge configuration, so nothing here can claim the scale.',
    );
  }
  if (censusEdge === undefined) {
    throw new Error(
      `the fixture protocol has no "${CENSUS_EDGE}" edge type, which is the one this census's prompt asks about.`,
    );
  }
  if (edgeConfig.type === CENSUS_EDGE) {
    throw new Error(
      `the fixture pedigree already records "${CENSUS_EDGE}" connections, so pointing it there proves nothing.`,
    );
  }

  harness.receiveCodebookUpdate({
    edge: {
      [CENSUS_EDGE]: {
        ...censusEdge,
        variables: {
          ...variablesOf(censusEdge),
          ...variablesOf(sections[PEDIGREE_EDGE_SECTION]),
        },
      },
    },
  });
  act(() => {
    harness.host.store.applyAsCollaborator(PEDIGREE_SECTION, {
      ...pedigree,
      edgeConfig: {
        ...edgeConfig,
        type: CENSUS_EDGE,
        isActiveVariable: SCALE_VARIABLE,
      },
    });
  });
}

/**
 * A prompt whose scale another interface sets for itself.
 *
 * The picker drops such an attribute, so it can never be chosen here — but a
 * prompt saved before the claim existed still names it, and the picker keeps a
 * stored pick on offer whatever becomes of it. So the save is the only thing
 * that can refuse it, and it refuses even a pick this edit did not touch:
 * saving the prompt again would go on overwriting the value the pedigree
 * computes.
 */
describe('a tie-strength prompt whose scale a pedigree sets', () => {
  it('refuses the save, and names the interface that sets it', async () => {
    const harness = renderStageEditor(openSection());
    await harness.opened();
    pedigreeClaimsTheScale(harness);

    await harness.user.click(
      screen.getByRole('button', { name: 'Edit prompt' }),
    );

    // Still the prompt's own pick, and still on offer: blanking it would hide
    // the reference the researcher has to repair.
    expect(
      await screen.findByRole('combobox', { name: 'Ordinal attribute' }),
    ).toHaveValue(SCALE_VARIABLE);

    await harness.user.click(screen.getByRole('button', { name: 'Save' }));

    expect(
      await screen.findByText(
        'This attribute is set by the Family Pedigree interface, which records whether a relationship is current, so it cannot be used here. Choose a different attribute.',
      ),
    ).toBeInTheDocument();
    expect(screen.getByRole('dialog')).toBeInTheDocument();
  });
});
