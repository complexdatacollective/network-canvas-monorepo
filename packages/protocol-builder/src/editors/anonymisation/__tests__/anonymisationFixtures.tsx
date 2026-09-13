import { screen, within } from '@testing-library/react';

import type { SectionDoc } from '@codaco/studio-sync/apply';
import { sectionId } from '@codaco/studio-sync/taxonomy';

import type {
  InMemoryClient,
  InMemoryHost,
} from '../../../testing/host/createInMemoryHost.ts';
import type { StageEditorHarness } from '../../../testing/renderStageEditor.tsx';

const PERSON_SECTION = sectionId({
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

/**
 * Opens one type's panel the way a researcher does.
 *
 * A type nothing protects yet starts switched off, so a test about its
 * checkboxes says so first — which is what the switch is for. The group
 * arriving is the wait: the panel is not in the DOM until the switch is on.
 */
export const switchOnType = async (
  harness: StageEditorHarness,
  typeName: string,
): Promise<void> => {
  await harness.user.click(
    await screen.findByRole('switch', { name: typeName }),
  );
  await screen.findByRole('group', {
    name: `Encrypted attributes for ${typeName}`,
  });
};

/**
 * A protocol whose `person` type ALREADY protects one attribute, seeded before
 * the editor opens.
 *
 * Written through the host rather than through the harness's own codebook
 * update because a type's switch reads what the codebook holds as it mounts:
 * a revision delivered afterwards is a collaborator's change to a section
 * whose switch is already standing where it stands.
 */
export const alreadyProtecting =
  (variableId: string) =>
  (host: InMemoryHost): InMemoryClient => {
    const person = host.store.read(PERSON_SECTION).document;
    const variables = person.variables;
    if (typeof variables !== 'object' || variables === null) {
      throw new Error('the fixture has no person attributes');
    }
    const held = (variables as Record<string, SectionDoc>)[variableId];
    if (held === undefined) {
      throw new Error(`the person type has no "${variableId}" attribute`);
    }
    host.store.applyAsCollaborator(PERSON_SECTION, {
      ...person,
      variables: { ...variables, [variableId]: { ...held, encrypted: true } },
    });
    return host.client;
  };
