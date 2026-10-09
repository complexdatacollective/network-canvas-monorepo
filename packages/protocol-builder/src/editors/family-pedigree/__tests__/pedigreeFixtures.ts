import { PEDIGREE_RELATIVES_NOT_RECORDED_OPTIONS } from '@codaco/protocol-validation';
import type { SectionDoc } from '@codaco/studio-sync/apply';
import { sectionId } from '@codaco/studio-sync/taxonomy';

import { loadFixtureStage } from '../../../testing/protocolFixture.ts';
import type { StageEditorHarness } from '../../../testing/renderStageEditor.tsx';

export const FAMILY_MEMBER_SECTION = sectionId({
  kind: 'codebookNode',
  typeId: 'family_member',
});

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

/**
 * More attributes on the fixture's person type, arriving from outside the
 * editor as a collaborator's would, in ONE revision. Two separate calls would
 * each read the person type as it stood before either arrived, and the second
 * would replace the first. The revision reaches the components over the
 * channel (a microtask), so read what it changed with `waitFor`/`findBy`.
 */
export function addFamilyMemberVariables(
  harness: StageEditorHarness,
  added: Readonly<Record<string, Readonly<Record<string, unknown>>>>,
): void {
  const section = harness.protocolSections()[FAMILY_MEMBER_SECTION];
  if (section === undefined) {
    throw new Error('the fixture protocol has no family_member node type');
  }
  const variables = isRecord(section.variables) ? section.variables : {};
  for (const variableId of Object.keys(added)) {
    if (Object.hasOwn(variables, variableId)) {
      throw new Error(
        `"family_member" already has a "${variableId}" attribute, so adding one proves nothing.`,
      );
    }
  }
  harness.receiveCodebookUpdate({
    node: {
      family_member: {
        ...section,
        variables: { ...variables, ...withLabels(added) },
      },
    },
  });
}

/**
 * Every schema 9 attribute has a label. A test that does not care what it is
 * gets the attribute's name, as Architect's own create flow writes it.
 */
const withLabels = (
  added: Readonly<Record<string, Readonly<Record<string, unknown>>>>,
): Record<string, Readonly<Record<string, unknown>>> =>
  Object.fromEntries(
    Object.entries(added).map(([variableId, variable]) => [
      variableId,
      { label: variable.name, ...variable },
    ]),
  );

/** One more attribute on the fixture's person type. */
export function addFamilyMemberVariable(
  harness: StageEditorHarness,
  variableId: string,
  variable: Readonly<Record<string, unknown>>,
): void {
  addFamilyMemberVariables(harness, { [variableId]: variable });
}

/**
 * The attribute definition for relatives not recorded: categorical, holding
 * exactly the values the interface owns for it.
 */
export const RELATIVES_NOT_RECORDED_VARIABLE: Readonly<
  Record<string, unknown>
> = Object.freeze({
  name: 'relativesNotRecorded',
  label: 'relativesNotRecorded',
  type: 'categorical',
  options: PEDIGREE_RELATIVES_NOT_RECORDED_OPTIONS.map(({ value, label }) => ({
    value,
    label: { 'en-US': label },
  })),
});

/** The fixture pedigree's name question: the wording Network Canvas supplies. */
export const FIXTURE_NAME_FIELD: SectionDoc = (() => {
  const { nodeConfiguration } = loadFixtureStage('family-pedigree-1').fields;
  const nameField = isRecord(nodeConfiguration)
    ? nodeConfiguration.nameField
    : undefined;
  if (!isRecord(nameField)) {
    throw new Error('The fixture stage "family-pedigree-1" has no name field.');
  }
  return nameField as SectionDoc;
})();

/**
 * The words of a completeness requirement's list as a researcher might write
 * them, each message using every argument it offers, in the canonical form
 * the editor writes, so that saving it unchanged returns it unchanged.
 */
export const RESEARCHER_TRACKER_TEXT: SectionDoc = {
  itemText: {
    parents: {
      listItem: {
        'en-US':
          '{isYou, select, true {{missing, plural, one {One more parent to add} other {# parents to add}}} other {{missing, plural, one {One more parent for {name}} other {# parents for {name}}}}}',
      },
    },
    siblings: {
      listItem: {
        'en-US':
          '{isYou, select, true {Your brothers and sisters} other {Brothers and sisters of {name}}}',
      },
      noneButton: {
        'en-US': '{isYou, select, true {I have none} other {{name} has none}}',
      },
      question: { 'en-US': 'Any brothers or sisters?' },
    },
    children: {
      listItem: {
        'en-US':
          '{isYou, select, true {Your children} other {Children of {name}}}',
      },
      noneButton: {
        'en-US': '{isYou, select, true {I have none} other {{name} has none}}',
      },
      question: { 'en-US': 'Any children?' },
    },
    details: {
      listItem: {
        'en-US': '{isYou, select, true {About you} other {About {name}}}',
      },
    },
  },
  recommendedNote: { 'en-US': 'Press Next again to skip these.' },
};

/** The fixture pedigree with whatever a test needs added to it. */
export function familyPedigreeStageWith(extra: SectionDoc): Readonly<{
  id: string;
  type: 'FamilyPedigree';
  fields: SectionDoc;
}> {
  const seeded = loadFixtureStage('family-pedigree-1');
  if (seeded.type !== 'FamilyPedigree') {
    throw new Error('The fixture stage "family-pedigree-1" changed interface.');
  }
  return {
    id: seeded.id,
    type: 'FamilyPedigree',
    fields: { ...seeded.fields, ...extra },
  };
}

/** The fixture pedigree with the named keys taken away. */
export function familyPedigreeStageWithout(keys: readonly string[]): Readonly<{
  id: string;
  type: 'FamilyPedigree';
  fields: SectionDoc;
}> {
  const seeded = loadFixtureStage('family-pedigree-1');
  if (seeded.type !== 'FamilyPedigree') {
    throw new Error('The fixture stage "family-pedigree-1" changed interface.');
  }
  for (const key of keys) {
    if (!Object.hasOwn(seeded.fields, key)) {
      throw new Error(
        `The fixture stage "family-pedigree-1" has no "${key}" to take away, so removing it proves nothing.`,
      );
    }
  }
  return {
    id: seeded.id,
    type: 'FamilyPedigree',
    fields: Object.fromEntries(
      Object.entries(seeded.fields).filter(([key]) => !keys.includes(key)),
    ),
  };
}
