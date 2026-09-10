import { screen, within } from '@testing-library/react';

import { sectionId } from '@codaco/studio-sync/taxonomy';

import type { StageEditorHarness } from '../../../testing/renderStageEditor.tsx';

export const PERSON_SECTION = sectionId({
  kind: 'codebookNode',
  typeId: 'person',
});

/** The checkbox for one attribute of one type, named by its own group. */
export const attributeCheckbox = (typeName: string, attribute: string) =>
  within(
    screen.getByRole('group', { name: `Encrypted attributes for ${typeName}` }),
  ).getByRole('checkbox', { name: attribute });

/** One codebook attribute, as the PROTOCOL holds it. */
export const personVariable = (
  harness: StageEditorHarness,
  variableId: string,
): Readonly<Record<string, unknown>> => {
  const variable = harness.hostCodebook().node?.person?.variables?.[variableId];
  if (variable === undefined) {
    throw new Error(`the person type has no "${variableId}" attribute`);
  }
  return variable;
};

/** The person type as the authoritative protocol currently holds it. */
export const personDocument = (harness: StageEditorHarness) => {
  const document = harness.protocolSections()[PERSON_SECTION];
  if (document === undefined) throw new Error('the fixture has no person type');
  return document;
};
