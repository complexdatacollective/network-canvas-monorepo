import { describe, it } from 'vitest';

import SubmitButton from '@codaco/fresco-ui/form/SubmitButton';
import type { SectionDoc } from '@codaco/studio-sync/apply';

import type { StageEditorActions } from '../../../stage-editor-contract.ts';
import {
  renderStageEditor,
  type StageEditorHarness,
} from '../../../testing/renderStageEditor.tsx';
import { CategoricalBinStageEditor } from '../CategoricalBinStageEditor.tsx';
import { DyadCensusStageEditor } from '../DyadCensusStageEditor.tsx';
import { OneToManyDyadCensusStageEditor } from '../OneToManyDyadCensusStageEditor.tsx';
import { OrdinalBinStageEditor } from '../OrdinalBinStageEditor.tsx';
import { TieStrengthCensusStageEditor } from '../TieStrengthCensusStageEditor.tsx';

/**
 * Every key each interface's schema allows, saved unchanged.
 *
 * The per-editor round trips beside this one open the shared all-interfaces
 * fixture, whose stages are deliberately minimal: no filter, no skip logic, no
 * interviewer guidance, no task introduction, no sort orders and no follow-up
 * bin. So they prove an editor keeps the handful of keys the fixture happens to
 * carry, and say nothing about the rest of the interface — a section quietly
 * dropped, or a key an editor rewrites on the way out, survives all of them.
 *
 * The stages here carry the FULL schema instead, and `roundTrip` asks both of
 * its questions of them: every key is owned by a mounted section, and the save
 * hands back exactly what it opened on.
 */

/**
 * The host's action chrome, as every case is mounted with it. Never disabled,
 * so a refused save can be asked for and reported rather than hidden behind an
 * inert button.
 */
const actions: StageEditorActions = ({ formId }) => (
  <SubmitButton form={formId}>Save stage</SubmitButton>
);

const SUBJECT = { entity: 'node', type: 'person' };

const FILTER = {
  join: 'AND',
  rules: [
    {
      type: 'node',
      id: 'filter-rule-1',
      options: {
        type: 'person',
        attribute: 'age',
        operator: 'GREATER_THAN',
        value: 18,
      },
    },
  ],
};

const SKIP_LOGIC = {
  action: 'SKIP',
  filter: {
    join: 'OR',
    rules: [
      {
        type: 'node',
        id: 'skip-rule-1',
        options: { type: 'person', operator: 'NOT_EXISTS' },
      },
    ],
  },
  destination: { type: 'finish' },
};

const INTRODUCTION = {
  title: 'Introduction',
  text: 'Some words the participant reads first.',
};

const BUCKET_SORT_ORDER = [{ property: 'name', direction: 'asc' }];
const BIN_SORT_ORDER = [{ property: '*', direction: 'desc' }];

/** What every stage in this family carries, whatever it asks about. */
const COMMON: SectionDoc = {
  interviewScript: 'Read this aloud.',
  subject: SUBJECT,
  filter: FILTER,
  skipLogic: SKIP_LOGIC,
};

const CASES: readonly Readonly<{
  name: string;
  open: () => StageEditorHarness;
}>[] = [
  {
    name: 'Categorical Bin',
    open: () =>
      renderStageEditor({
        stage: {
          type: 'CategoricalBin',
          fields: {
            ...COMMON,
            label: 'Full categorical bin',
            prompts: [
              {
                id: 'p1',
                text: 'What kind of contact?',
                variable: 'contactType',
                otherVariable: 'relationship_to_ego',
                otherOptionLabel: 'Other',
                otherVariablePrompt: 'What kind of contact is it?',
                bucketSortOrder: BUCKET_SORT_ORDER,
                binSortOrder: BIN_SORT_ORDER,
              },
            ],
          },
        },
        editor: CategoricalBinStageEditor,
        actions,
      }),
  },
  {
    name: 'Ordinal Bin',
    open: () =>
      renderStageEditor({
        stage: {
          type: 'OrdinalBin',
          fields: {
            ...COMMON,
            label: 'Full ordinal bin',
            prompts: [
              {
                id: 'p1',
                text: 'How often?',
                variable: 'contactFreq',
                color: 'ord-color-seq-4',
                bucketSortOrder: BUCKET_SORT_ORDER,
                binSortOrder: BIN_SORT_ORDER,
              },
            ],
          },
        },
        editor: OrdinalBinStageEditor,
        actions,
      }),
  },
  {
    name: 'Dyad Census',
    open: () =>
      renderStageEditor({
        stage: {
          type: 'DyadCensus',
          fields: {
            ...COMMON,
            label: 'Full dyad census',
            introductionPanel: INTRODUCTION,
            prompts: [
              {
                id: 'p1',
                text: 'Do they know each other?',
                createEdge: 'knows',
              },
            ],
          },
        },
        editor: DyadCensusStageEditor,
        actions,
      }),
  },
  {
    name: 'One-to-Many Dyad Census',
    open: () =>
      renderStageEditor({
        stage: {
          type: 'OneToManyDyadCensus',
          fields: {
            ...COMMON,
            label: 'Full one-to-many dyad census',
            behaviours: { removeAfterConsideration: false },
            prompts: [
              {
                id: 'p1',
                text: 'Who does this person know?',
                createEdge: 'knows',
                bucketSortOrder: BUCKET_SORT_ORDER,
                binSortOrder: BIN_SORT_ORDER,
              },
            ],
          },
        },
        editor: OneToManyDyadCensusStageEditor,
        actions,
      }),
  },
  {
    name: 'Tie-Strength Census',
    open: () =>
      renderStageEditor({
        stage: {
          type: 'TieStrengthCensus',
          fields: {
            ...COMMON,
            label: 'Full tie-strength census',
            introductionPanel: INTRODUCTION,
            prompts: [
              {
                id: 'p1',
                text: 'How close?',
                createEdge: 'knows',
                edgeVariable: 'closeness',
                negativeLabel: 'Not connected',
              },
            ],
          },
        },
        editor: TieStrengthCensusStageEditor,
        actions,
      }),
  },
];

describe('a census or bin stage that uses every key its schema allows', () => {
  it.each(CASES)(
    'saves a whole $name unchanged, with every key owned by a section',
    async ({ open }) => {
      const harness = open();

      await harness.roundTrip();
    },
  );
});
