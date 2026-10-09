import { describe, expect, it } from 'vitest';

import {
  PEDIGREE_RELATIONSHIPS_TO_PARTICIPANT,
  type StageType,
} from '@codaco/protocol-validation';
import type { SectionDoc } from '@codaco/studio-sync/apply';

import type { StageEditorComponent } from '../../stage-editor-contract.ts';
import { renderStageEditor } from '../../testing/renderStageEditor.tsx';
import {
  familyPedigreeEditor,
  openEveryWordingGroup,
  shimMarkdownEditorMeasurement,
} from '../family-pedigree/__tests__/editorFixtures.ts';
import {
  addFamilyMemberVariables,
  EVERY_PEDIGREE_WORD,
  FIXTURE_NAME_FIELD,
  RELATIVES_NOT_RECORDED_VARIABLE,
  RESEARCHER_TRACKER_TEXT,
} from '../family-pedigree/__tests__/pedigreeFixtures.ts';
import { schemaKeysFor } from './schemaKeys.ts';

shimMarkdownEditorMeasurement();

const INTERVIEW_SCRIPT = 'Read this to the participant before you begin.';

/**
 * A stage that is skipped, and where the interview goes when it is.
 *
 * `destination` is included deliberately: it is the optional half of an
 * optional key, so it is exactly the sort of thing a save drops without
 * anything on screen having said so.
 */
const SKIP_LOGIC: SectionDoc = {
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
};

/** Not in the fixture protocol, so it is added to the person type as well. */
const RELATIVES_NOT_RECORDED_ATTRIBUTE = 'relativesNotRecorded';

/** The boolean attribute the maximal pedigree's nomination prompt records. */
const NOMINATION_ATTRIBUTE = 'has_heart_disease';
/** The relationship to the participant, with the interface's fixed values. */
const RELATIONSHIP_ATTRIBUTE = 'fm_relationship';

const FAMILY_PEDIGREE_FIELDS: SectionDoc = {
  label: { 'en-US': 'Family Pedigree' },
  interviewScript: INTERVIEW_SCRIPT,
  skipLogic: SKIP_LOGIC,
  subject: { entity: 'node', type: 'family_member' },
  prompt: { 'en-US': 'Add the members of your family.' },
  nodeConfiguration: {
    nameAttribute: 'fm_name',
    genderIdentity: {
      attribute: 'genderIdentity',
      terms: [
        { value: 'woman', words: 'feminine' },
        { value: 'man', words: 'masculine' },
        { value: 'nonBinary', words: 'neutral' },
        { value: 'differentIdentity', words: 'neutral' },
        { value: 'unknown', words: 'unknown' },
        { value: 'preferNotToSay', words: 'neutral' },
      ],
    },
    sexAssignedAtBirthAttribute: 'sexAssignedAtBirth',
    egoAttribute: 'is_ego',
    relationshipToParticipantAttribute: RELATIONSHIP_ATTRIBUTE,
    nameField: FIXTURE_NAME_FIELD,
  },
  edgeConfiguration: {
    type: 'family_edge',
    kindAttribute: 'relationshipKind',
    gestationalCarrierAttribute: 'isGestationalCarrier',
    currentPartnerAttribute: 'isCurrentPartner',
  },
  completeness: {
    scope: 'thirdDegree',
    enforcement: 'recommended',
    relativesNotRecordedAttribute: RELATIVES_NOT_RECORDED_ATTRIBUTE,
    ...RESEARCHER_TRACKER_TEXT,
  },
  framing: 'participantPreference',
  wording: EVERY_PEDIGREE_WORD,
  nominationPrompts: [
    {
      id: 'nomination-1',
      text: { 'en-US': 'Who in your family has had heart disease?' },
      attribute: NOMINATION_ATTRIBUTE,
      onlyForSexAssignedAtBirth: 'female',
    },
  ],
  // NOT one of the person attributes: the interface already collects those
  // itself, so the extra fields may not. See `MEMBER_FORM_ATTRIBUTE`.
  form: {
    fields: [
      { variable: 'fm_occupation', prompt: { 'en-US': 'What do they do?' } },
    ],
  },
};

/**
 * The attribute the maximal pedigree's extra person field collects, and the
 * fact that it has to be put on the type first: every attribute the fixture's
 * `family_member` type carries is bound to one of the pedigree's own person
 * attribute slots, so this one arrives the way a collaborator's would.
 */
const MEMBER_FORM_ATTRIBUTE = 'fm_occupation';

type MaximalStage = Readonly<{
  stageType: StageType;
  /**
   * The fixture stage this one stands in for. Opened as a stage of its own,
   * it would bind the gender identity attribute the fixture's pedigree
   * already manages, which only one stage may.
   */
  stageId: string;
  editor: StageEditorComponent;
  fields: SectionDoc;
  /**
   * Keys the schema has and the editor has no section for yet. They round-trip
   * untouched, so a researcher cannot see or change them.
   */
  unowned?: readonly string[];
}>;

/**
 * One stage of each interface this family edits, carrying EVERY key its schema
 * declares — the optional ones above all.
 *
 * The fixture protocol's stages are each configured one plausible way, so a
 * key it happens not to use is a key no test opens an editor on: the editor
 * mounts, the key survives the save untouched because nothing rendered it, and
 * the whole suite goes on passing while a researcher who opens that stage
 * cannot see or change something their protocol holds. These stages exist to
 * take that away — every optional key is set, so a missing section shows up as
 * an unowned key and a section that mangles one shows up as a changed value.
 *
 * Everything they name is real in the fixture protocol: the attributes are the
 * codebook's and the assets are the manifest's. A stage that referred to
 * something absent would be refused by the stage's own schema rather than by
 * the editor, which proves nothing about either.
 */
const MAXIMAL: readonly MaximalStage[] = [
  {
    stageType: 'FamilyPedigree',
    stageId: 'family-pedigree-1',
    editor: familyPedigreeEditor,
    fields: FAMILY_PEDIGREE_FIELDS,
  },
];

describe.each(MAXIMAL)(
  'a $stageType stage holding every key its schema declares',
  ({ stageType, stageId, editor, fields, unowned = [] }: MaximalStage) => {
    /**
     * The stage above is the schema's key list, spelled as a stage. A key
     * added to this interface fails here first, with the key named, rather
     * than in the round trip below with a section blamed for losing it.
     */
    it('is a stage the schema has no other key for', () => {
      expect(Object.keys(fields).toSorted()).toEqual(schemaKeysFor(stageType));
    });

    /**
     * Two claims about one save. Every key is owned by something the editor
     * mounts — `unowned` is empty, so a key no section renders fails rather
     * than surviving untouched — and the save gives back exactly what it was
     * given, which is where a nested key is caught: a slot inside
     * `nodeConfiguration` or `edgeConfiguration`. Those are inside a value a
     * section already owns, so only the comparison notices when one stops
     * being rendered.
     */
    it('is edited by a section, and saved back exactly as it arrived', async () => {
      const harness = renderStageEditor({
        stage: { id: stageId, type: stageType, fields },
        editor,
      });
      addFamilyMemberVariables(harness, {
        [MEMBER_FORM_ATTRIBUTE]: {
          name: MEMBER_FORM_ATTRIBUTE,
          label: MEMBER_FORM_ATTRIBUTE,
          type: 'text',
          component: 'Text',
        },
        [RELATIVES_NOT_RECORDED_ATTRIBUTE]: RELATIVES_NOT_RECORDED_VARIABLE,
        [NOMINATION_ATTRIBUTE]: {
          name: NOMINATION_ATTRIBUTE,
          label: NOMINATION_ATTRIBUTE,
          type: 'boolean',
        },
        [RELATIONSHIP_ATTRIBUTE]: {
          name: RELATIONSHIP_ATTRIBUTE,
          label: RELATIONSHIP_ATTRIBUTE,
          type: 'categorical',
          options: PEDIGREE_RELATIONSHIPS_TO_PARTICIPANT.map((value) => ({
            value,
            label: { 'en-US': value },
          })),
        },
      });
      await openEveryWordingGroup(harness);

      await harness.roundTrip({ unowned: [...unowned] });
    });
  },
);

/** The fixture stage each of those interfaces is configured one way in. */
const FIXTURE_STAGES: readonly Readonly<{
  stageId: string;
  editor: StageEditorComponent;
}>[] = [{ stageId: 'family-pedigree-1', editor: familyPedigreeEditor }];

/**
 * The other half of the round trip, which the stages above cannot ask.
 *
 * A stage carrying every key its schema has cannot gain one: an invented key
 * the schema does not know is refused by the stage's own schema, and
 * every key it does know is already there. So the question "did the editor add
 * something nobody authored" has to be put to a stage that is MISSING optional
 * keys — which is what the fixture protocol's stages are.
 *
 * The failure it catches is a section starting an unanswered field at a
 * normalised empty value — `?? []`, `?? false` — and saving that as an answer.
 * The researcher never made that decision, and the protocol now records it.
 * `roundTrip` reports it: the harness compares the two documents in both
 * directions and all the way down, so an invented key is named by its path
 * whether it is top-level or nested inside one a section does own.
 */
describe.each(FIXTURE_STAGES)(
  'the stage "$stageId" as the fixture protocol configures it',
  ({ stageId, editor }) => {
    it('is saved back without a key the researcher never authored', async () => {
      const harness = renderStageEditor({ stageId, editor });
      await openEveryWordingGroup(harness);

      await harness.roundTrip({ unowned: [] });
    });
  },
);
