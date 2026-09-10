import { act, screen, within } from '@testing-library/react';

import type { SectionDoc } from '@codaco/studio-sync/apply';
import {
  sectionId,
  type ProtocolSectionId,
} from '@codaco/studio-sync/taxonomy';

import {
  fixtureProtocolSections,
  loadFixtureStage,
} from '../../../testing/protocolFixture.ts';
import type { StageEditorHarness } from '../../../testing/renderStageEditor.tsx';
import { narrativePedigreeStageEditor } from '../NarrativePedigreeStageEditor.ts';

export const SOURCE_STAGE_SECTION = sectionId({
  kind: 'stage',
  stageId: 'family-pedigree-1',
});
const STAGE_ORDER_SECTION = sectionId({ kind: 'stageOrder' });
const FAMILY_MEMBER_SECTION = sectionId({
  kind: 'codebookNode',
  typeId: 'family_member',
});

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

/**
 * The fixture narrative pedigree, with whatever the test needs replaced.
 *
 * Built from the fixture stage rather than from a hand-written one, so a test
 * still fails when the fixture and the schema disagree about what a narrative
 * pedigree holds.
 */
export function narrativePedigreeHolding(extra: SectionDoc) {
  const seeded = loadFixtureStage('narrative-pedigree-1');
  if (seeded.type !== 'NarrativePedigree') {
    throw new Error(
      'The fixture stage "narrative-pedigree-1" changed interface.',
    );
  }
  return {
    stage: {
      id: seeded.id,
      type: 'NarrativePedigree' as const,
      fields: { ...seeded.fields, ...extra },
    },
    registry: narrativePedigreeStageEditor,
  };
}

/**
 * The fixture narrative pedigree's own disease row.
 *
 * Read from the protocol rather than written out here, so a test that changes
 * one field of it is still a test about a row the schema otherwise accepts.
 */
export function fixtureDisease(): Record<string, unknown> {
  const diseases = loadFixtureStage('narrative-pedigree-1').fields.diseases;
  const disease = Array.isArray(diseases) ? diseases[0] : undefined;
  if (!isRecord(disease)) {
    throw new Error('The fixture narrative pedigree has no disease to read.');
  }
  return { ...disease };
}

/** The source pedigree, as the fixture protocol holds it. */
export function sourcePedigreeDocument(): SectionDoc {
  const document = fixtureProtocolSections()[SOURCE_STAGE_SECTION];
  if (document === undefined) {
    throw new Error('The fixture protocol has no "family-pedigree-1" stage.');
  }
  return document;
}

/**
 * A section rewritten by somebody else, arriving mid-edit.
 *
 * The store's own collaborator route, so the revision travels the channel this
 * editor is subscribed to — the same way `receiveCodebookUpdate` delivers a
 * codebook change, taken here for the sections that are not the codebook.
 */
export function receiveSection(
  harness: StageEditorHarness,
  id: ProtocolSectionId,
  document: SectionDoc,
): void {
  act(() => {
    harness.host.store.applyAsCollaborator(id, document);
  });
}

export function stageOrder(harness: StageEditorHarness): string[] {
  const order = harness.protocolSections()[STAGE_ORDER_SECTION]?.stages;
  return Array.isArray(order)
    ? order.filter((entry): entry is string => typeof entry === 'string')
    : [];
}

/** The interview re-ordered by somebody else while this editor is open. */
export function reorderStages(
  harness: StageEditorHarness,
  reorder: (stages: string[]) => string[],
): void {
  receiveSection(harness, STAGE_ORDER_SECTION, {
    stages: reorder(stageOrder(harness)),
  });
}

/**
 * The source pedigree's own node type as a collaborator has just left it.
 *
 * Read from the fixture's definition rather than written out here, so a test
 * cannot quietly assert against a node type the protocol does not have. `add`
 * puts an attribute there the fixture does not carry; `remove` takes one away,
 * which is how a deletion arrives.
 */
export function familyMemberCodebook(
  change: Readonly<{
    add?: Readonly<Record<string, SectionDoc>>;
    remove?: string;
  }>,
): SectionDoc {
  const definition = fixtureProtocolSections()[FAMILY_MEMBER_SECTION];
  if (definition === undefined) {
    throw new Error('The fixture protocol has no "family_member" node type.');
  }
  const variables = definition.variables;
  if (!isRecord(variables)) {
    throw new Error('The fixture "family_member" node type has no attributes.');
  }
  const next: Record<string, unknown> = { ...variables, ...change.add };
  if (change.remove !== undefined) delete next[change.remove];
  return { ...definition, variables: next };
}

/** The attributes a native picker is currently offering, by their ids. */
export const optionsOf = (element: HTMLElement): string[] =>
  [...element.querySelectorAll('option')]
    .map((option) => option.value)
    .filter((value) => value !== '');

/** Opens one disease row and answers with its dialog. */
export const openDisease = async (
  harness: StageEditorHarness,
  index = 0,
): Promise<ReturnType<typeof within>> => {
  const editButtons = await screen.findAllByRole('button', {
    name: 'Edit disease',
  });
  await harness.user.click(editButtons[index] as HTMLElement);
  return within(await screen.findByRole('dialog'));
};

/** Adds a disease through the list's own add button. */
export const addDisease = async (
  harness: StageEditorHarness,
): Promise<ReturnType<typeof within>> => {
  await harness.user.click(
    await screen.findByRole('button', { name: 'Create new disease' }),
  );
  return within(await screen.findByRole('dialog'));
};
