import { screen, waitFor, within } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import type { StageType } from '@codaco/protocol-validation';
import type { SectionDoc } from '@codaco/studio-sync/apply';

import type { StageEditorRegistry } from '../../stage-editor-contract.ts';
import {
  expectNoLocaleLeaks,
  protocolStrings,
} from '../../testing/localeSweep.ts';
import type { FixtureStageId } from '../../testing/protocolFixture.ts';
import {
  renderStageEditor,
  type StageEditorHarness,
} from '../../testing/renderStageEditor.tsx';
import { categoricalBinStageEditor } from '../categorical-bin/CategoricalBinStageEditor.ts';
import { dyadCensusStageEditor } from '../dyad-census/DyadCensusStageEditor.ts';
import { nameGeneratorQuickAddStageEditor } from '../name-generator-quick-add/NameGeneratorQuickAddStageEditor.ts';
import { nameGeneratorRosterStageEditor } from '../name-generator-roster/NameGeneratorRosterStageEditor.ts';
import { oneToManyDyadCensusStageEditor } from '../one-to-many-dyad-census/OneToManyDyadCensusStageEditor.ts';
import { ordinalBinStageEditor } from '../ordinal-bin/OrdinalBinStageEditor.ts';
import { tieStrengthCensusStageEditor } from '../tie-strength-census/TieStrengthCensusStageEditor.ts';

/**
 * Family 3a's editors — the three censuses, the two bins and the two name
 * generators that are not the form-based one — asked the four questions every
 * one of them owes its schema and its researcher.
 *
 * One table rather than a file per editor, because the questions are the same
 * for all of them and the answers are data: which sections the editor
 * composes, that a fixture stage survives being opened and saved, that a stage
 * using EVERY key its schema allows survives the same, that each of a prompt's
 * optional keys is authored through a control of its own, and that a Spanish
 * researcher reads no English. What only one interface can be asked lives in
 * that editor's own test beside it.
 *
 * The file keeps the name it was opened under so the family's three steps
 * merge line by line; it now covers the whole family rather than the censuses
 * and bins alone.
 */

const SUBJECT = { entity: 'node', type: 'person' };
const INTRODUCTION = {
  title: 'Introduction',
  text: 'Some words the participant reads first.',
};
const BUCKET_SORT_ORDER = [{ property: 'name', direction: 'asc' }];
const BIN_SORT_ORDER = [{ property: '*', direction: 'desc' }];

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

/** What every stage in this family carries, whatever it asks about. */
const COMMON: SectionDoc = {
  interviewScript: 'Read this aloud.',
  subject: SUBJECT,
  filter: FILTER,
  skipLogic: SKIP_LOGIC,
};

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
   * closed and clears what is inside it when it is closed, so a group that
   * opened switched off is a key the researcher cannot see and would lose.
   */
  checked?: true;
}>;

/** How a case rewrites one prompt key, and what the save then has to carry. */
type Rewrite = Readonly<{
  key: string;
  value: unknown;
  write: (harness: StageEditorHarness) => Promise<void>;
}>;

type EditorCase = Readonly<{
  /** Names the case, and is what a failure reports. */
  interfaceName: StageType;
  /** The stage of the shared all-interfaces protocol this editor opens. */
  stageId: FixtureStageId;
  /** The editor's own registry entry, dispatched through as a host would. */
  editor: Partial<StageEditorRegistry>;
  /** The outline a researcher reads down the side of the stage, in order. */
  sections: readonly string[];
  /**
   * The capabilities this editor offers, named in Spanish, for the locale
   * sweep to switch on.
   *
   * Named rather than found, so a section that stopped saying its own name in
   * Spanish fails the sweep instead of quietly dropping out of it — and per
   * case rather than shared, because the family's editors do not all offer the
   * same ones: neither name generator has a stage filter, and only the roster
   * has three lists chosen out of a data file.
   */
  optionalSections: readonly string[];
  /** The top-level stage keys those sections have a field for. */
  ownedKeys: readonly string[];
  /** A stage of this type using every key its schema allows. */
  wholeStage: SectionDoc;
  /** The one prompt that stage holds, whose keys the dialog must author. */
  prompt: Record<string, unknown>;
  /** Which control authors each of that prompt's keys. */
  authoredBy: Readonly<Record<string, readonly Control[]>>;
  rewrite: Rewrite;
}>;

/** The two controls one open sort-order group offers, inside that group. */
const sortRuleControls = (group: string): readonly Control[] => [
  { role: 'switch', name: group, checked: true },
  { role: 'combobox', name: 'Property', within: group },
  { role: 'combobox', name: 'Direction', within: group },
];

const DYAD_PROMPT = {
  id: 'p1',
  text: 'Do they know each other?',
  createEdge: 'knows',
};

const TIE_STRENGTH_PROMPT = {
  id: 'p1',
  text: 'How close?',
  createEdge: 'knows',
  edgeVariable: 'closeness',
  negativeLabel: 'Not connected',
};

const ONE_TO_MANY_PROMPT = {
  id: 'p1',
  text: 'Who does this person know?',
  createEdge: 'knows',
  bucketSortOrder: BUCKET_SORT_ORDER,
  binSortOrder: BIN_SORT_ORDER,
};

const ORDINAL_BIN_PROMPT = {
  id: 'p1',
  text: 'How often?',
  variable: 'contactFreq',
  color: 'ord-color-seq-1',
  bucketSortOrder: BUCKET_SORT_ORDER,
  binSortOrder: BIN_SORT_ORDER,
};

/**
 * What the two name generators in this family hold that the censuses do not.
 *
 * Neither has a `filter`: the schema gives one to every census and bin here
 * and to neither generator, which is Architect's `FilteredNodeType` /
 * `NodeType` split.
 */
const WITHOUT_FILTER: SectionDoc = {
  interviewScript: COMMON.interviewScript,
  subject: SUBJECT,
  skipLogic: SKIP_LOGIC,
};

/**
 * A side panel offering the people the interview has already named.
 *
 * It carries its own `id`, as every row in this builder's lists does: the list
 * is addressed by row identity rather than by position, and a panel without
 * one is not a row the section can render.
 */
const PANEL = {
  id: 'panel-1',
  title: 'People you already named',
  dataSource: 'existing',
};

/**
 * Both generators' prompts are the same shape in the schema — a question and
 * the fixed values it stamps on everyone named under it — so they are asked
 * about the same prompt and the same controls.
 */
const NAME_GENERATOR_PROMPT = {
  id: 'p1',
  text: 'Who are the people you know?',
  additionalAttributes: [{ variable: 'highlighted', value: true }],
};

const NAME_GENERATOR_PROMPT_CONTROLS: Readonly<
  Record<string, readonly Control[]>
> = {
  text: [{ role: 'textbox', name: 'Prompt text' }],
  additionalAttributes: [
    { role: 'combobox', name: 'Create or select an attribute' },
    { role: 'radio', name: 'True', checked: true },
  ],
};

/**
 * The stamp's VALUE, rewritten through the control that authors it. The
 * attribute cell of the same row would do as well; the value is the half a
 * researcher changes without changing what the prompt is about.
 */
const REWRITE_A_STAMP: Rewrite = {
  key: 'additionalAttributes',
  value: [{ variable: 'highlighted', value: false }],
  write: async (harness) => {
    await harness.user.click(screen.getByRole('radio', { name: 'False' }));
  },
};

/**
 * Every key a Categorical Bin prompt allows, which means the follow-up bin
 * switched on: the schema's own variant rule is that a prompt carries all
 * three of the fields describing it or none of them.
 */
const CATEGORICAL_BIN_PROMPT = {
  id: 'p1',
  text: 'What kind of contact?',
  variable: 'contactType',
  otherVariable: 'relationship_to_ego',
  otherOptionLabel: 'Something else',
  otherVariablePrompt: 'What kind of contact is it?',
  bucketSortOrder: BUCKET_SORT_ORDER,
  binSortOrder: BIN_SORT_ORDER,
};

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

const CASES: readonly EditorCase[] = [
  {
    interfaceName: 'DyadCensus',
    stageId: 'dyad-census-1',
    editor: dyadCensusStageEditor,
    sections: [
      'Stage name',
      'Node setup',
      'Stage filter',
      'Task introduction',
      'Prompt collection',
      'Skip logic',
      'Interviewer guidance',
    ],
    optionalSections: [
      'Filtro de la etapa',
      'Lógica de salto',
      'Guía para quien realiza la entrevista',
    ],
    ownedKeys: ['introductionPanel', 'label', 'prompts', 'subject'],
    wholeStage: {
      ...COMMON,
      label: 'Full dyad census',
      introductionPanel: INTRODUCTION,
      prompts: [DYAD_PROMPT],
    },
    prompt: DYAD_PROMPT,
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
  },
  {
    interfaceName: 'TieStrengthCensus',
    stageId: 'tie-strength-census-1',
    editor: tieStrengthCensusStageEditor,
    sections: [
      'Stage name',
      'Node setup',
      'Stage filter',
      'Task introduction',
      'Prompt collection',
      'Skip logic',
      'Interviewer guidance',
    ],
    optionalSections: [
      'Filtro de la etapa',
      'Lógica de salto',
      'Guía para quien realiza la entrevista',
    ],
    ownedKeys: ['introductionPanel', 'label', 'prompts', 'subject'],
    wholeStage: {
      ...COMMON,
      label: 'Full tie-strength census',
      introductionPanel: INTRODUCTION,
      prompts: [TIE_STRENGTH_PROMPT],
    },
    prompt: TIE_STRENGTH_PROMPT,
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
  },
  {
    interfaceName: 'OneToManyDyadCensus',
    stageId: 'one-to-many-dyad-census-1',
    editor: oneToManyDyadCensusStageEditor,
    sections: [
      'Stage name',
      'Node setup',
      'Stage filter',
      'Prompt collection',
      'Node availability',
      'Skip logic',
      'Interviewer guidance',
    ],
    optionalSections: [
      'Filtro de la etapa',
      'Lógica de salto',
      'Guía para quien realiza la entrevista',
    ],
    ownedKeys: ['behaviours', 'label', 'prompts', 'subject'],
    wholeStage: {
      ...COMMON,
      label: 'Full one-to-many dyad census',
      behaviours: { removeAfterConsideration: false },
      prompts: [ONE_TO_MANY_PROMPT],
    },
    prompt: ONE_TO_MANY_PROMPT,
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
  },
  {
    interfaceName: 'OrdinalBin',
    stageId: 'ordinal-bin-1',
    editor: ordinalBinStageEditor,
    sections: [
      'Stage name',
      'Node setup',
      'Stage filter',
      'Prompt collection',
      'Skip logic',
      'Interviewer guidance',
    ],
    optionalSections: [
      'Filtro de la etapa',
      'Lógica de salto',
      'Guía para quien realiza la entrevista',
    ],
    ownedKeys: ['label', 'prompts', 'subject'],
    wholeStage: {
      ...COMMON,
      label: 'Full ordinal bin',
      prompts: [ORDINAL_BIN_PROMPT],
    },
    prompt: ORDINAL_BIN_PROMPT,
    authoredBy: {
      text: [{ role: 'textbox', name: 'Prompt text' }],
      variable: [{ role: 'combobox', name: 'Attribute' }],
      // `ord-color-seq-1` is the first swatch of the schema's own sequence.
      color: [{ role: 'radio', name: 'Sea Green', checked: true }],
      bucketSortOrder: sortRuleControls('Bucket order'),
      binSortOrder: sortRuleControls('Bin order'),
    },
    rewrite: {
      key: 'color',
      value: 'ord-color-seq-3',
      write: async (harness) => {
        await harness.user.click(screen.getByRole('radio', { name: 'Tomato' }));
      },
    },
  },
  {
    interfaceName: 'CategoricalBin',
    stageId: 'categorical-bin-1',
    editor: categoricalBinStageEditor,
    sections: [
      'Stage name',
      'Node setup',
      'Stage filter',
      'Prompt collection',
      'Skip logic',
      'Interviewer guidance',
    ],
    optionalSections: [
      'Filtro de la etapa',
      'Lógica de salto',
      'Guía para quien realiza la entrevista',
    ],
    ownedKeys: ['label', 'prompts', 'subject'],
    wholeStage: {
      ...COMMON,
      label: 'Full categorical bin',
      prompts: [CATEGORICAL_BIN_PROMPT],
    },
    prompt: CATEGORICAL_BIN_PROMPT,
    authoredBy: {
      text: [{ role: 'textbox', name: 'Prompt text' }],
      variable: [{ role: 'combobox', name: 'Attribute' }],
      otherVariable: [
        { role: 'switch', name: 'A bin for anything else', checked: true },
        {
          role: 'combobox',
          name: 'Attribute the answer is stored in',
          within: 'A bin for anything else',
        },
      ],
      otherOptionLabel: [
        {
          role: 'textbox',
          name: 'Bin label',
          within: 'A bin for anything else',
        },
      ],
      otherVariablePrompt: [
        {
          role: 'textbox',
          name: 'Follow-up question',
          within: 'A bin for anything else',
        },
      ],
      bucketSortOrder: sortRuleControls('Bucket order'),
      binSortOrder: sortRuleControls('Bin order'),
    },
    rewrite: {
      key: 'otherOptionLabel',
      value: 'Anything else',
      write: (harness) => retype(harness, 'Bin label', 'Anything else'),
    },
  },
  {
    interfaceName: 'NameGeneratorQuickAdd',
    stageId: 'name-generator-quick-add-1',
    editor: nameGeneratorQuickAddStageEditor,
    sections: [
      'Stage name',
      'Node setup',
      'Quick add configuration',
      'Prompt collection',
      'Side panels',
      'Nomination limits',
      'Skip logic',
      'Interviewer guidance',
    ],
    // No `panels` or `behaviours`: the fixture stage has neither, and both are
    // capabilities whose fields only exist once they are switched on.
    optionalSections: [
      'Paneles laterales',
      'Límites de nominación',
      'Lógica de salto',
      'Guía para quien realiza la entrevista',
    ],
    ownedKeys: ['label', 'prompts', 'quickAdd', 'subject'],
    wholeStage: {
      ...WITHOUT_FILTER,
      label: 'Full quick-add name generator',
      quickAdd: 'name',
      panels: [PANEL],
      behaviours: { minNodes: 1, maxNodes: 8 },
      prompts: [NAME_GENERATOR_PROMPT],
    },
    prompt: NAME_GENERATOR_PROMPT,
    authoredBy: NAME_GENERATOR_PROMPT_CONTROLS,
    rewrite: REWRITE_A_STAMP,
  },
  {
    interfaceName: 'NameGeneratorRoster',
    stageId: 'name-generator-roster-1',
    editor: nameGeneratorRosterStageEditor,
    sections: [
      'Stage name',
      'Node setup',
      'Roster source',
      'Prompt collection',
      'Card details',
      'Roster sorting',
      'Roster search',
      'Nomination limits',
      'Skip logic',
      'Interviewer guidance',
    ],
    optionalSections: [
      'Detalles de las tarjetas',
      'Orden de la lista',
      'Búsqueda en la lista',
      'Límites de nominación',
      'Lógica de salto',
      'Guía para quien realiza la entrevista',
    ],
    ownedKeys: [
      'behaviours',
      'cardOptions',
      'dataSource',
      'label',
      'prompts',
      'searchOptions',
      'sortOptions',
      'subject',
    ],
    wholeStage: {
      ...WITHOUT_FILTER,
      label: 'Full roster name generator',
      dataSource: 'roster_data',
      cardOptions: {
        additionalProperties: [{ label: 'Age', variable: 'age' }],
      },
      sortOptions: {
        sortOrder: [{ property: 'age', direction: 'desc' }],
        sortableProperties: [{ label: 'Age', variable: 'age' }],
      },
      searchOptions: { fuzziness: 0.5, matchProperties: ['name', 'age'] },
      behaviours: { minNodes: 1, maxNodes: 8 },
      prompts: [NAME_GENERATOR_PROMPT],
    },
    prompt: NAME_GENERATOR_PROMPT,
    authoredBy: NAME_GENERATOR_PROMPT_CONTROLS,
    rewrite: REWRITE_A_STAMP,
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

describe('the census and bin editors written as section lists', () => {
  it.each(CASES)(
    '$interfaceName renders the sections it lists, in that order',
    async ({ stageId, editor, sections }) => {
      const harness = renderStageEditor({ stageId, registry: editor });

      // Every section registers itself on mount and the outline is built from
      // what is registered — so an outline that is still short has not finished
      // mounting rather than having lost a section.
      await waitFor(() =>
        expect(harness.outline()).toHaveLength(sections.length),
      );
      expect(harness.outline().map((section) => section.title)).toEqual([
        ...sections,
      ]);
    },
  );

  /**
   * Each editor's own stage out of the shared all-interfaces protocol, opened
   * and saved without a single edit.
   *
   * Two claims, both `roundTrip`'s: the document handed back deep-equals the
   * one the protocol holds, and every key of it is owned by a section that is
   * on screen. `unowned` is empty for all three — there is nothing any of
   * these stages holds that the researcher cannot see and change.
   */
  it.each(CASES)(
    '$interfaceName saves the fixture stage it opened, losing nothing',
    async ({ stageId, editor, ownedKeys }) => {
      const harness = renderStageEditor({ stageId, registry: editor });

      await waitFor(() => expect(harness.ownedKeys()).toEqual([...ownedKeys]));
      await harness.roundTrip({ unowned: [] });
    },
  );

  /**
   * And a stage using every key its schema allows, which the fixture stages
   * deliberately do not.
   *
   * They carry no filter, no skip logic, no interviewer guidance and no sort
   * orders, so the round trip above proves an editor keeps the handful of keys
   * the fixture happens to hold and says nothing about the rest of the
   * interface: a section quietly dropped survives it untouched. These stages
   * are the whole schema, and `roundTrip` asks its two questions of them.
   */
  it.each(CASES)(
    '$interfaceName saves a whole $interfaceName unchanged, every key owned by a section',
    async ({ interfaceName, editor, wholeStage }) => {
      const harness = renderStageEditor({
        stage: { type: interfaceName, fields: wholeStage },
        registry: editor,
      });

      await harness.roundTrip();
    },
  );
});

/**
 * A prompt using every optional key its interface allows, authored through the
 * dialog.
 *
 * A stage save alone cannot ask this. The prompt list is one field value of the
 * stage, so a stage saved without opening a row returns whatever it was seeded
 * with whether or not any control inside the dialog ever rendered — and opening
 * the row is not enough either, because committing one MERGES the dialog's
 * values over the row it opened on, so a key the dialog collected nothing for
 * keeps its old value through the merge and an equality check passes with the
 * control deleted.
 *
 * So each case asks three things in the dialog:
 *
 * 1. every key the seeded prompt carries is named against the control that
 *    authors it, and every one of those controls is mounted when the dialog
 *    opens. A key added to the interface and left off the list fails the first
 *    assertion; a control renamed, dropped, or left inside a group that opened
 *    switched off fails the second;
 * 2. one key per case is REWRITTEN through its control and has to arrive in the
 *    saved prompt — which is what a mounted control cannot fake: it is bound to
 *    the key it is named for rather than to nothing at all;
 * 3. every other key comes back exactly as it was opened on.
 *
 * `id` is not listed: it is the row's identity, which nothing authors.
 */
describe('a prompt that uses every optional key its interface allows', () => {
  it.each(CASES)(
    'authors every key of a $interfaceName prompt through a control of its own',
    async ({
      interfaceName,
      editor,
      wholeStage,
      prompt,
      authoredBy,
      rewrite,
    }) => {
      const harness = renderStageEditor({
        stage: { type: interfaceName, fields: wholeStage },
        registry: editor,
      });

      await harness.user.click(
        screen.getByRole('button', { name: 'Edit prompt' }),
      );
      await screen.findByRole('dialog');
      // Every optional group inside the dialog opens itself from the row it was
      // given and seeds its fields as it does. Reading before they have settled
      // would prove nothing about what the dialog holds.
      await waitFor(() =>
        expect(screen.getByRole('button', { name: 'Save' })).toBeEnabled(),
      );

      expect(Object.keys(authoredBy).toSorted()).toEqual(
        Object.keys(prompt)
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

/**
 * What a Spanish researcher reads in a whole census editor.
 *
 * The per-editor suites mount no provider, so they render each descriptor's
 * English `defaultMessage` and their assertions are about behaviour rather than
 * about the catalog. This is the other question, asked of every surface each
 * editor can put on screen: is there anything here a translator has already
 * answered for that the reader is getting in English anyway?
 *
 * Swept as whole EDITORS rather than as their prompt sections, because a census
 * is more than its prompts — it mounts the shared subject, filter,
 * introduction, skip logic and interviewer guidance sections too, and a sweep
 * of the prompts alone would miss every sentence those put around them.
 *
 * It shares its reading with `src/__tests__/localeSweep.test.tsx`, which is
 * where the sweep is itself proved able to fail.
 */
describe('the family’s editors, swept under es', () => {
  const switchOn = async (
    harness: StageEditorHarness,
    control: HTMLElement,
  ): Promise<void> => {
    if (control.getAttribute('aria-checked') === 'true') return;
    await harness.user.click(control);
    await waitFor(() => expect(control).toBeChecked());
  };

  /**
   * Turns on everything that is off, and keeps going until nothing is.
   *
   * One pass is not enough: switching a capability on MOUNTS its fields, and
   * some of those are switches of their own. A pass that read the document once
   * would leave the second layer off and sweep a surface the researcher never
   * stops at. Bounded rather than looped to exhaustion, so a pair that turn
   * each other off fails as a test rather than hanging.
   */
  const switchEverythingOn = async (
    harness: StageEditorHarness,
  ): Promise<void> => {
    for (let pass = 0; pass < 5; pass += 1) {
      const off = screen
        .queryAllByRole('switch')
        .filter((control) => control.getAttribute('aria-checked') !== 'true');
      if (off.length === 0) return;
      for (const control of off) await switchOn(harness, control);
    }
    expect(
      screen
        .queryAllByRole('switch')
        .filter((control) => control.getAttribute('aria-checked') !== 'true'),
    ).toEqual([]);
  };

  const closeDialog = async (harness: StageEditorHarness): Promise<void> => {
    await harness.user.keyboard('{Escape}');
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
  };

  /**
   * Everything on screen that belongs to the researcher rather than to this
   * package: the protocol's own sections, the stage's seeded fields, and the
   * codebook the family's pickers read type and attribute names out of.
   *
   * Read out of the harness rather than listed by hand, so a fixture that gains
   * an attribute does not quietly widen the sweep's blind spot — or start
   * failing it.
   */
  const researcherWords = (harness: StageEditorHarness) =>
    protocolStrings(
      harness.protocolSections(),
      harness.seeded.fields,
      harness.hostCodebook(),
    );

  /**
   * Every surface one census editor reaches without leaving its own areas.
   *
   * The stage at rest, then with each optional section switched on — those
   * sections' fields only exist once they are — and then through the three
   * things a researcher does to the list of prompts. Inside the row dialog
   * every switch is turned on as well, which is how each family's own optional
   * fields get read.
   *
   * What it deliberately does not open is the dialog behind "Crear un tipo de
   * vínculo nuevo" and its siblings. Those are `codebook/components/`'s, whose
   * own chrome is still English on purpose — `ID_MAP.md` records it as i18n-2's
   * to finish under `codebookEntity` — so sweeping them here would report that
   * work as this family's.
   */
  const sweepEditor = async (
    family: string,
    harness: StageEditorHarness,
    optionalSections: readonly string[],
  ): Promise<void> => {
    await screen.findByRole('textbox', { name: 'Nombre de la etapa' });
    await waitFor(() =>
      expect(harness.outline().map((entry) => entry.title)).toContain(
        'Guía para quien realiza la entrevista',
      ),
    );
    expectNoLocaleLeaks(`${family} at rest`, researcherWords(harness));

    // Named rather than found, so a section that stopped saying its own name in
    // Spanish fails here instead of quietly dropping out of the sweep.
    for (const section of optionalSections) {
      await switchOn(harness, screen.getByRole('switch', { name: section }));
    }
    await switchEverythingOn(harness);
    expectNoLocaleLeaks(
      `${family} with every section switched on`,
      researcherWords(harness),
    );

    await harness.user.click(
      screen.getByRole('button', { name: 'Crear nueva pregunta' }),
    );
    await screen.findByRole('dialog');
    expectNoLocaleLeaks(`${family}, adding a prompt`, researcherWords(harness));
    await closeDialog(harness);

    await harness.user.click(
      screen.getByRole('button', { name: 'Editar pregunta' }),
    );
    await screen.findByRole('dialog');
    expectNoLocaleLeaks(
      `${family}, editing a prompt`,
      researcherWords(harness),
    );
    await switchEverythingOn(harness);
    expectNoLocaleLeaks(
      `${family}, editing a prompt with every field it offers switched on`,
      researcherWords(harness),
    );
    await closeDialog(harness);

    await harness.user.click(
      screen.getByRole('button', { name: 'Eliminar pregunta' }),
    );
    await screen.findByRole('dialog');
    expectNoLocaleLeaks(
      `${family}, removing a prompt`,
      researcherWords(harness),
    );
  };

  it.each(CASES)(
    'sweeps a $interfaceName',
    async ({ stageId, editor, optionalSections }) => {
      await sweepEditor(
        stageId,
        renderStageEditor({ stageId, locale: 'es', registry: editor }),
        optionalSections,
      );
    },
  );
});
