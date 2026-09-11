import { screen, waitFor, within } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import type { SectionDoc } from '@codaco/studio-sync/apply';
import { sectionId } from '@codaco/studio-sync/taxonomy';

import type { StageEditorHarness } from '../../../testing/renderStageEditor.tsx';
import { renderStageEditor } from '../../../testing/renderStageEditor.tsx';
import { nameGeneratorQuickAddStageEditor } from '../NameGeneratorQuickAddStageEditor.ts';

const PERSON_SECTION = sectionId({ kind: 'codebookNode', typeId: 'person' });

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

/**
 * A text attribute nothing else in the fixture protocol touches.
 *
 * The case below is about the two writers of ONE stage, so the attribute they
 * argue over has to be free of every other claim: an attribute a form
 * elsewhere collects is already kept out of this picker by the role map, and a
 * case built on one would pass with the stage's own writers ignored.
 */
const addFreeTextVariable = (
  harness: StageEditorHarness,
  variableId: string,
): void => {
  const section = harness.protocolSections()[PERSON_SECTION];
  if (section === undefined) {
    throw new Error('the fixture protocol has no person node type');
  }
  const variables = isRecord(section.variables) ? section.variables : {};
  if (Object.hasOwn(variables, variableId)) {
    throw new Error(
      `"person" already has a "${variableId}" attribute, so adding one proves nothing.`,
    );
  }
  const updated: SectionDoc = {
    ...section,
    variables: {
      ...variables,
      [variableId]: { name: variableId, type: 'text', component: 'Text' },
    },
  };
  harness.receiveCodebookUpdate({ node: { person: updated } });
};

const optionValuesOf = (picker: HTMLElement): string[] =>
  within(picker)
    .getAllByRole('option')
    .map((option) => (option as HTMLOptionElement).value);

const quickAddPicker = async (): Promise<HTMLElement> =>
  screen.findByRole('combobox', { name: /Attribute filled in/ });

/**
 * The stage seeded over the fixture's own quick-add generator, so the role map
 * takes the SAVED copy of this stage out and the draft below is the only thing
 * claiming its attributes.
 */
const quickAddHolding = (fields: SectionDoc) => ({
  registry: nameGeneratorQuickAddStageEditor,
  stage: {
    id: 'name-generator-quick-add-1',
    type: 'NameGeneratorQuickAdd' as const,
    fields: {
      label: 'Name Generator Quick Add',
      subject: { entity: 'node', type: 'person' },
      ...fields,
    },
  },
});

/**
 * The box a participant types a person's name into and the fixed values a
 * prompt stamps on everyone named under it are opposite writers of the same
 * codebook: quick add honours the attribute's rules while they type, a stamp
 * writes straight past them, and the protocol's own role-conflict rule refuses
 * a stage that does both to one attribute.
 *
 * The stamps are read from the LIVE stage rather than from the role map, which
 * is built with the edited stage taken out. A protocol authored elsewhere can
 * arrive with a prompt stamping a text attribute, and the picker offered it as
 * the box to fill in: a conflict the researcher would have created by
 * accepting what they were shown, with nothing at the save to catch it.
 */
describe('what a quick-add generator and its own prompts may not share', () => {
  it('does not offer an attribute this stage’s own prompts stamp', async () => {
    const harness = renderStageEditor(
      quickAddHolding({
        quickAdd: 'name',
        prompts: [
          {
            id: 'name-generator-quick-add-prompt-1',
            text: 'Quickly add people you know',
            additionalAttributes: [{ variable: 'nickname', value: true }],
          },
        ],
      }),
    );
    addFreeTextVariable(harness, 'nickname');

    // The attribute exists and is of the one type this box can fill in, so its
    // absence below is the stamp's doing and not the type filter's.
    await waitFor(async () =>
      expect(optionValuesOf(await quickAddPicker())).toContain('name'),
    );
    await waitFor(async () =>
      expect(optionValuesOf(await quickAddPicker())).not.toContain('nickname'),
    );
  });
});
