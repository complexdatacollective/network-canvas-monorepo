import { screen, waitFor } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import SubmitButton from '@codaco/fresco-ui/form/SubmitButton';

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
 * A researcher who opens a prompt to read it and presses Save gets the same
 * prompt back.
 *
 * `roundTrip` never opens a row dialog, so it cannot see a key only the row
 * editor can lose: the prompt list is one field value, and a stage saved
 * without touching it round-trips whatever the fixture held whether or not any
 * control inside the dialog ever renders it. What the dialog collects only
 * becomes the prompt when the dialog is committed — so every optional key a
 * prompt in this family carries is loaded here, opened, and committed
 * untouched.
 */

const actions: StageEditorActions = ({ formId }) => (
  <SubmitButton form={formId}>Save stage</SubmitButton>
);

const SUBJECT = { entity: 'node', type: 'person' };
const INTRODUCTION = { title: 'Before we start', text: 'You will see pairs.' };
const BUCKET_SORT_ORDER = [{ property: 'name', direction: 'asc' }];
const BIN_SORT_ORDER = [{ property: '*', direction: 'desc' }];

const CATEGORICAL_BIN_PROMPTS = [
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
];

const ORDINAL_BIN_PROMPTS = [
  {
    id: 'p1',
    text: 'How often?',
    variable: 'contactFreq',
    color: 'ord-color-seq-4',
    bucketSortOrder: BUCKET_SORT_ORDER,
    binSortOrder: BIN_SORT_ORDER,
  },
];

const DYAD_CENSUS_PROMPTS = [
  { id: 'p1', text: 'Do they know each other?', createEdge: 'knows' },
];

const ONE_TO_MANY_PROMPTS = [
  {
    id: 'p1',
    text: 'Who does this person know?',
    createEdge: 'knows',
    bucketSortOrder: BUCKET_SORT_ORDER,
    binSortOrder: BIN_SORT_ORDER,
  },
];

const TIE_STRENGTH_PROMPTS = [
  {
    id: 'p1',
    text: 'How close?',
    createEdge: 'knows',
    edgeVariable: 'closeness',
    negativeLabel: 'They do not know each other',
  },
];

const CASES: readonly Readonly<{
  name: string;
  prompts: readonly Record<string, unknown>[];
  open: () => StageEditorHarness;
}>[] = [
  {
    name: 'Categorical Bin',
    prompts: CATEGORICAL_BIN_PROMPTS,
    open: () =>
      renderStageEditor({
        stage: {
          type: 'CategoricalBin',
          fields: {
            label: 'Bin',
            subject: SUBJECT,
            prompts: CATEGORICAL_BIN_PROMPTS,
          },
        },
        editor: CategoricalBinStageEditor,
        actions,
      }),
  },
  {
    name: 'Ordinal Bin',
    prompts: ORDINAL_BIN_PROMPTS,
    open: () =>
      renderStageEditor({
        stage: {
          type: 'OrdinalBin',
          fields: {
            label: 'Bin',
            subject: SUBJECT,
            prompts: ORDINAL_BIN_PROMPTS,
          },
        },
        editor: OrdinalBinStageEditor,
        actions,
      }),
  },
  {
    name: 'Dyad Census',
    prompts: DYAD_CENSUS_PROMPTS,
    open: () =>
      renderStageEditor({
        stage: {
          type: 'DyadCensus',
          fields: {
            label: 'Census',
            subject: SUBJECT,
            introductionPanel: INTRODUCTION,
            prompts: DYAD_CENSUS_PROMPTS,
          },
        },
        editor: DyadCensusStageEditor,
        actions,
      }),
  },
  {
    name: 'One-to-Many Dyad Census',
    prompts: ONE_TO_MANY_PROMPTS,
    open: () =>
      renderStageEditor({
        stage: {
          type: 'OneToManyDyadCensus',
          fields: {
            label: 'Census',
            subject: SUBJECT,
            behaviours: { removeAfterConsideration: true },
            prompts: ONE_TO_MANY_PROMPTS,
          },
        },
        editor: OneToManyDyadCensusStageEditor,
        actions,
      }),
  },
  {
    name: 'Tie-Strength Census',
    prompts: TIE_STRENGTH_PROMPTS,
    open: () =>
      renderStageEditor({
        stage: {
          type: 'TieStrengthCensus',
          fields: {
            label: 'Census',
            subject: SUBJECT,
            introductionPanel: INTRODUCTION,
            prompts: TIE_STRENGTH_PROMPTS,
          },
        },
        editor: TieStrengthCensusStageEditor,
        actions,
      }),
  },
];

/** Opens the one prompt the stage holds and commits it without editing it. */
async function openAndCommitTheOnlyPrompt(harness: StageEditorHarness) {
  await harness.user.click(screen.getByRole('button', { name: 'Edit prompt' }));
  await screen.findByRole('dialog');
  // Every optional group inside the dialog opens itself from the row it was
  // given, and each one seeds its fields as it does. Saving before they have
  // settled would prove nothing about what the dialog holds.
  await waitFor(() =>
    expect(screen.getByRole('button', { name: 'Save' })).toBeEnabled(),
  );
  await harness.user.click(screen.getByRole('button', { name: 'Save' }));
  await waitFor(() =>
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument(),
  );
}

describe('a prompt that uses every optional key its interface allows', () => {
  it.each(CASES)(
    'opens and re-saves a $name prompt unchanged',
    async ({ open, prompts }) => {
      const harness = open();

      await openAndCommitTheOnlyPrompt(harness);

      const request = await harness.submit();
      expect(request).not.toBeNull();
      expect(request?.stageDocument.prompts).toEqual(prompts);
    },
  );
});
