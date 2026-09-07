import { screen, waitFor, within } from '@testing-library/react';
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
 * Every optional key a prompt in this family can carry, authored through a
 * control the researcher can reach.
 *
 * A stage save alone cannot ask this. The prompt list is one field value of
 * the stage, so a stage saved without opening a row returns whatever the
 * fixture held whether or not any control inside the dialog ever rendered it —
 * and opening the row is not enough either, because committing one MERGES the
 * dialog's values over the row it opened on. A key the dialog collected
 * nothing for keeps its old value through the merge, so an equality check
 * against the seeded prompt passes with the control deleted.
 *
 * So each case asks three things of its interface, in the dialog:
 *
 * 1. Every key the seeded prompt carries is named here against the control
 *    that authors it, and every one of those controls is mounted when the
 *    dialog opens. A key added to the interface and left off this list fails
 *    the first assertion; a control renamed, dropped, or left inside a group
 *    that opened switched off fails the second. Closed groups matter twice
 *    over: `Section` clears the fields inside it, so a group that opened shut
 *    would silently drop what the researcher saved.
 * 2. One key per case is REWRITTEN through its control and has to arrive in
 *    the saved prompt. That is what a mounted control cannot fake: it is bound
 *    to the key it is named for, rather than to nothing at all.
 * 3. Every other key comes back exactly as it was opened on.
 *
 * `id` is not listed: it is the row's identity, which nothing authors.
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

/** One control a researcher writes a prompt key through. */
type Control = Readonly<{
  role: 'textbox' | 'combobox' | 'switch' | 'radio';
  /** Its accessible name, as the researcher reads it. */
  name: string;
  /**
   * Only inside the group of this name. Two open sort orders offer a
   * `Property` and a `Direction` each, so the name alone names two controls.
   */
  within?: string;
  /**
   * A group toggle that has to be ON. A `Section` mounts nothing while it is
   * closed, and clears what is inside it when it is closed, so a group that
   * opened switched off is a key the researcher cannot see and would lose.
   */
  checked?: true;
}>;

/** How a case rewrites one key, and what the save then has to carry. */
type Rewrite = Readonly<{
  key: string;
  value: unknown;
  write: (harness: StageEditorHarness) => Promise<void>;
}>;

type Case = Readonly<{
  name: string;
  prompts: readonly Record<string, unknown>[];
  authoredBy: Readonly<Record<string, readonly Control[]>>;
  rewrite: Rewrite;
  open: () => StageEditorHarness;
}>;

/** The two controls one open sort-order group offers, inside that group. */
const sortRuleControls = (group: string): readonly Control[] => [
  { role: 'switch', name: group, checked: true },
  { role: 'combobox', name: 'Property', within: group },
  { role: 'combobox', name: 'Direction', within: group },
];

/**
 * Replaces a rich text field's contents the way a researcher does: into the
 * field, select what is there, type over it.
 *
 * Not `clear` then `type`. `clear` empties the editor by deleting a selection
 * it made itself, and the caret it leaves behind is outside the empty
 * paragraph, so the first character typed lands in a paragraph of its own —
 * the field then holds two paragraphs and saves as a leading space plus the
 * text. Selecting through the editor's own select-all keeps the caret the
 * editor's to place, which is what a keyboard does.
 */
const retype = async (
  harness: StageEditorHarness,
  label: string,
  text: string,
) => {
  const field = screen.getByRole('textbox', { name: label });
  await harness.user.click(field);
  await harness.user.keyboard('{Control>}a{/Control}');
  await harness.user.type(field, text);
};

const CASES: readonly Case[] = [
  {
    name: 'Categorical Bin',
    prompts: CATEGORICAL_BIN_PROMPTS,
    authoredBy: {
      text: [{ role: 'textbox', name: 'Prompt text' }],
      variable: [{ role: 'combobox', name: 'Attribute' }],
      otherVariable: [
        { role: 'switch', name: 'A bin for anything else', checked: true },
        { role: 'combobox', name: 'Attribute the answer is stored in' },
      ],
      otherOptionLabel: [{ role: 'textbox', name: 'Bin label' }],
      otherVariablePrompt: [{ role: 'textbox', name: 'Follow-up question' }],
      bucketSortOrder: sortRuleControls(
        'Order people are handed to the participant in',
      ),
      binSortOrder: sortRuleControls('Order within each bin'),
    },
    rewrite: {
      key: 'otherOptionLabel',
      value: 'Else',
      write: (harness) => retype(harness, 'Bin label', 'Else'),
    },
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
    authoredBy: {
      text: [{ role: 'textbox', name: 'Prompt text' }],
      variable: [{ role: 'combobox', name: 'Attribute' }],
      // `ord-color-seq-4` is the fourth swatch of the schema's sequence.
      color: [{ role: 'radio', name: 'Neon Carrot', checked: true }],
      bucketSortOrder: sortRuleControls(
        'Order people are handed to the participant in',
      ),
      binSortOrder: sortRuleControls('Order within each bin'),
    },
    rewrite: {
      key: 'color',
      value: 'ord-color-seq-3',
      write: async (harness) => {
        await harness.user.click(screen.getByRole('radio', { name: 'Tomato' }));
      },
    },
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
    authoredBy: {
      text: [{ role: 'textbox', name: 'Prompt text' }],
      createEdge: [{ role: 'radio', name: 'knows', checked: true }],
    },
    rewrite: {
      key: 'createEdge',
      value: 'family_edge',
      write: async (harness) => {
        await harness.user.click(
          screen.getByRole('radio', { name: 'family_edge' }),
        );
      },
    },
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
    authoredBy: {
      text: [{ role: 'textbox', name: 'Prompt text' }],
      createEdge: [{ role: 'radio', name: 'knows', checked: true }],
      bucketSortOrder: sortRuleControls('Order of the people asked about'),
      binSortOrder: sortRuleControls('Order of the people to choose from'),
    },
    rewrite: {
      key: 'bucketSortOrder',
      value: [{ property: 'name', direction: 'desc' }],
      write: async (harness) => {
        const group = screen.getByRole('region', {
          name: 'Order of the people asked about',
        });
        await harness.user.selectOptions(
          within(group).getByRole('combobox', { name: 'Direction' }),
          'desc',
        );
      },
    },
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
    authoredBy: {
      text: [{ role: 'textbox', name: 'Prompt text' }],
      createEdge: [{ role: 'radio', name: 'knows', checked: true }],
      edgeVariable: [{ role: 'combobox', name: 'Attribute' }],
      negativeLabel: [{ role: 'textbox', name: 'Decline answer' }],
    },
    rewrite: {
      key: 'negativeLabel',
      value: 'Never met',
      write: (harness) => retype(harness, 'Decline answer', 'Never met'),
    },
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

/** Asserts one named control is mounted, and switched on where it must be. */
function expectControl(control: Control): void {
  const scope =
    control.within === undefined
      ? screen
      : within(screen.getByRole('region', { name: control.within }));
  const found = scope.getAllByRole(control.role, { name: control.name });
  if (control.checked === true) {
    for (const element of found) expect(element).toBeChecked();
  }
}

describe('a prompt that uses every optional key its interface allows', () => {
  it.each(CASES)(
    'authors every key of a $name prompt through a control of its own',
    async ({ open, prompts, authoredBy, rewrite }) => {
      const harness = open();
      const [prompt] = prompts;

      await harness.user.click(
        screen.getByRole('button', { name: 'Edit prompt' }),
      );
      await screen.findByRole('dialog');
      // Every optional group inside the dialog opens itself from the row it
      // was given, and each one seeds its fields as it does. Reading before
      // they have settled would prove nothing about what the dialog holds.
      await waitFor(() =>
        expect(screen.getByRole('button', { name: 'Save' })).toBeEnabled(),
      );

      expect(Object.keys(authoredBy).toSorted()).toEqual(
        Object.keys(prompt ?? {})
          .filter((key) => key !== 'id')
          .toSorted(),
      );
      for (const controls of Object.values(authoredBy)) {
        for (const control of controls) expectControl(control);
      }

      await rewrite.write(harness);
      await harness.user.click(screen.getByRole('button', { name: 'Save' }));
      await waitFor(() =>
        expect(screen.queryByRole('dialog')).not.toBeInTheDocument(),
      );

      const request = await harness.submit();
      expect(request).not.toBeNull();
      expect(request?.stageDocument.prompts).toEqual([
        { ...prompt, [rewrite.key]: rewrite.value },
      ]);
    },
  );
});
