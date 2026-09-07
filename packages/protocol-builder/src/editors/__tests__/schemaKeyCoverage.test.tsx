import { describe, expect, it } from 'vitest';

import { type StageType, stageSchema } from '@codaco/protocol-validation';
import type { SectionDoc } from '@codaco/studio-sync/apply';

import type { StageEditorComponent } from '../../stage-editor-contract.ts';
import { renderStageEditor } from '../../testing/renderStageEditor.tsx';
import { harnessEditor } from '../network/__tests__/editorFixtures.tsx';
import { NetworkComposerStageEditor } from '../network/NetworkComposerStageEditor.tsx';
import { SociogramStageEditor } from '../network/SociogramStageEditor.tsx';
import {
  familyPedigreeEditor,
  narrativePedigreeEditor,
  shimMarkdownEditorMeasurement,
} from '../pedigree/__tests__/editorFixtures.tsx';

shimMarkdownEditorMeasurement();

/** The two keys the editing session owns, which are never a section's. */
const IDENTITY_KEYS: readonly string[] = Object.freeze(['id', 'type']);

/**
 * Every key the protocol schema declares for one interface, asked of the
 * schema itself.
 *
 * Read rather than listed, because a list would be a second copy of the
 * schema: a key added to an interface in a later release has to fail this
 * test, and a list written out here would go on passing while the editor
 * silently discarded it.
 */
function schemaKeysFor(stageType: StageType): string[] {
  const option = stageSchema.options.find(
    (candidate) => candidate.shape.type.value === stageType,
  );
  if (option === undefined) {
    throw new Error(`The protocol schema has no "${stageType}" stage.`);
  }
  return Object.keys(option.shape)
    .filter((key) => !IDENTITY_KEYS.includes(key))
    .toSorted();
}

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

/** Which of the network's people the stage works on. */
const NODE_FILTER: SectionDoc = {
  join: 'AND',
  rules: [
    {
      id: 'filter-rule-1',
      type: 'node',
      options: {
        type: 'person',
        attribute: 'age',
        operator: 'GREATER_THAN',
        value: 18,
      },
    },
  ],
};

const PERSON: SectionDoc = { entity: 'node', type: 'person' };

const EVERY_CANVAS_BEHAVIOUR: SectionDoc = {
  automaticLayout: true,
  allowRepositioning: true,
  freeDraw: true,
};

const SOCIOGRAM_FIELDS: SectionDoc = {
  label: 'Sociogram',
  interviewScript: INTERVIEW_SCRIPT,
  skipLogic: SKIP_LOGIC,
  subject: PERSON,
  filter: NODE_FILTER,
  background: { concentricCircles: 4, skewedTowardCenter: true },
  behaviours: EVERY_CANVAS_BEHAVIOUR,
  prompts: [
    {
      id: 'sociogram-prompt-1',
      text: 'Place the people who know each other close together',
      // The order the participant is handed the people still to be placed in.
      sortOrder: [{ property: 'name', direction: 'asc' }],
      layout: { layoutVariable: 'layout' },
      edges: { display: ['knows'], create: 'knows' },
      highlight: { allowHighlighting: false },
    },
  ],
};

const NETWORK_COMPOSER_FIELDS: SectionDoc = {
  label: 'Network Composer',
  interviewScript: INTERVIEW_SCRIPT,
  skipLogic: SKIP_LOGIC,
  subject: PERSON,
  quickAdd: 'composerName',
  layoutVariable: 'layout',
  // The inspector's own form, and one form per kind of connection drawn.
  nodeForm: {
    fields: [
      {
        id: 'composer-node-field-1',
        variable: 'name',
        component: 'Text',
        label: 'What do you call them?',
        hint: 'A first name is enough.',
      },
    ],
  },
  convexHullVariable: 'contactType',
  background: { concentricCircles: 4 },
  behaviours: { automaticLayout: true },
  edges: [
    {
      id: 'composer-edge-1',
      subject: { entity: 'edge', type: 'knows' },
      form: { fields: [{ variable: 'edgeNotes', component: 'Text' }] },
    },
  ],
};

const FAMILY_PEDIGREE_FIELDS: SectionDoc = {
  label: 'Family Pedigree',
  interviewScript: INTERVIEW_SCRIPT,
  skipLogic: SKIP_LOGIC,
  nodeConfig: {
    type: 'family_member',
    nodeLabelVariable: 'fm_name',
    egoVariable: 'is_ego',
    relationshipVariable: 'fm_relationship_to_ego',
    biologicalSexVariable: 'biologicalSex',
    // What the participant is asked as they add each family member.
    form: [{ variable: 'fm_name', prompt: 'What do they go by?' }],
  },
  edgeConfig: {
    type: 'family_edge',
    relationshipTypeVariable: 'relationshipType',
    isActiveVariable: 'isActive',
    isGestationalCarrierVariable: 'isGestationalCarrier',
    gameteRoleVariable: 'gameteRole',
  },
  framing: { mode: 'fixed', value: 'gamete' },
  boundaries: {
    requireGrandparents: 'off',
    requireChildrenContributors: 'off',
  },
  introScreen: {
    items: [
      {
        id: 'intro-1',
        type: 'text',
        content: 'We are going to draw your family.',
      },
    ],
  },
  censusPrompt: 'Who is in your family?',
  nominationPrompts: [
    {
      id: 'nomination-1',
      text: 'Who has been unwell?',
      variable: 'hasConditionX',
    },
  ],
};

const NARRATIVE_PEDIGREE_FIELDS: SectionDoc = {
  label: 'Narrative Pedigree',
  interviewScript: INTERVIEW_SCRIPT,
  skipLogic: SKIP_LOGIC,
  sourceStageId: 'family-pedigree-1',
  showAtRiskStatuses: true,
  diseases: [
    {
      id: 'disease-1',
      label: 'Condition X',
      color: 'node-color-seq-1',
      variable: 'hasConditionX',
      inheritancePattern: 'autosomalDominant',
    },
  ],
};

type MaximalStage = Readonly<{
  stageType: StageType;
  editor: StageEditorComponent;
  fields: SectionDoc;
}>;

/**
 * One stage of each interface these two families edit, carrying EVERY key its
 * schema declares — the optional ones above all.
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
 * codebook's, the assets are the manifest's, and the stage a narrative
 * pedigree reads from is the fixture's own family pedigree. A stage that
 * referred to something absent would be refused by the session's validation
 * rather than by the editor, which proves nothing about either.
 */
const MAXIMAL: readonly MaximalStage[] = [
  {
    stageType: 'Sociogram',
    editor: harnessEditor(SociogramStageEditor, 'Sociogram'),
    fields: SOCIOGRAM_FIELDS,
  },
  {
    stageType: 'NetworkComposer',
    editor: harnessEditor(NetworkComposerStageEditor, 'NetworkComposer'),
    fields: NETWORK_COMPOSER_FIELDS,
  },
  {
    stageType: 'FamilyPedigree',
    editor: familyPedigreeEditor,
    fields: FAMILY_PEDIGREE_FIELDS,
  },
  {
    stageType: 'NarrativePedigree',
    editor: narrativePedigreeEditor,
    fields: NARRATIVE_PEDIGREE_FIELDS,
  },
];

describe.each(MAXIMAL)(
  'a $stageType stage holding every key its schema declares',
  ({ stageType, editor, fields }: MaximalStage) => {
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
     * given, which is where a nested optional key is caught: `sortOrder`
     * inside a prompt, `form` inside `nodeConfig`, `create` inside a prompt's
     * `edges`. Those are inside a value a section already owns, so only the
     * comparison notices when one stops being rendered.
     */
    it('is edited by a section, and saved back exactly as it arrived', async () => {
      const harness = renderStageEditor({
        stage: { type: stageType, fields },
        editor,
      });

      await harness.roundTrip({ unowned: [] });
    });
  },
);

/** The fixture stage each of those interfaces is configured one way in. */
const FIXTURE_STAGES: readonly Readonly<{
  stageId: string;
  editor: StageEditorComponent;
}>[] = [
  {
    stageId: 'sociogram-1',
    editor: harnessEditor(SociogramStageEditor, 'Sociogram'),
  },
  {
    stageId: 'network-composer-1',
    editor: harnessEditor(NetworkComposerStageEditor, 'NetworkComposer'),
  },
  { stageId: 'family-pedigree-1', editor: familyPedigreeEditor },
  { stageId: 'narrative-pedigree-1', editor: narrativePedigreeEditor },
];

/**
 * The other half of the round trip, which the stages above cannot ask.
 *
 * A stage carrying every key its schema has cannot gain one: an invented key
 * the schema does not know is refused by the session's own validation, and
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

      await harness.roundTrip({ unowned: [] });
    });
  },
);
