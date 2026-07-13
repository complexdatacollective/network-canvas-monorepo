import { expect, gotoProtocol, test } from '../../fixtures/architect-test.js';
import { emptyProtocol } from '../../fixtures/seed.js';
import { stageSnapshotJson } from '../../helpers/normalize-stage.js';
import { readProtocolJson, readStageJson } from '../../helpers/read-store.js';
import { selectOrCreateNodeType } from '../../pageobjects/editor-sections/entity-types.js';
import { addPrompt } from '../../pageobjects/editor-sections/prompts.js';
import {
  createVariableViaSpotlight,
  createVariableWithOptions,
} from '../../pageobjects/editor-sections/variables.js';
import { StageEditor } from '../../pageobjects/stage-editor.js';

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null;

type CodebookOption = { label: string; value: string };
type CodebookVariable = { type: string; options?: CodebookOption[] };

function toCodebookOption(value: unknown): CodebookOption {
  if (
    isRecord(value) &&
    typeof value.label === 'string' &&
    typeof value.value === 'string'
  ) {
    return { label: value.label, value: value.value };
  }
  throw new Error(
    `codebook variable option has unexpected shape: ${JSON.stringify(value)}`,
  );
}

function toCodebookVariable(value: unknown): CodebookVariable {
  if (isRecord(value) && typeof value.type === 'string') {
    return {
      type: value.type,
      options: Array.isArray(value.options)
        ? value.options.map(toCodebookOption)
        : undefined,
    };
  }
  throw new Error(
    `codebook variable has unexpected shape: ${JSON.stringify(value)}`,
  );
}

// Walks `codebook.node.*.variables` (rather than looking the node type id up
// separately) for the given variable id — confirms `createVariableWithOptions`
// actually persisted the variable + its options into the codebook, not just
// closed the NewVariableWindow dialog without error.
function findNodeCodebookVariable(
  protocol: Record<string, unknown>,
  variableId: string,
): CodebookVariable {
  const { codebook } = protocol;
  if (!isRecord(codebook) || !isRecord(codebook.node)) {
    throw new Error('protocol JSON has no codebook.node object');
  }
  for (const nodeType of Object.values(codebook.node)) {
    if (
      isRecord(nodeType) &&
      isRecord(nodeType.variables) &&
      variableId in nodeType.variables
    ) {
      return toCodebookVariable(nodeType.variables[variableId]);
    }
  }
  throw new Error(`no codebook.node variable found with id "${variableId}"`);
}

test('creates a valid OrdinalBin stage from scratch', async ({
  architectPage,
  seed,
}) => {
  await seed(emptyProtocol());
  await gotoProtocol(architectPage);

  const editor = new StageEditor(architectPage);
  await editor.createNew('OrdinalBin');
  await editor.setStageName('Rank These');

  // FilteredNodeType (StageEditor/Interfaces.tsx: OrdinalBin's sections are
  // `[FilteredNodeType, OrdinalBinPrompts, SkipLogic, InterviewScript]` — no
  // IntroductionPanel, unlike the census family).
  await selectOrCreateNodeType(architectPage, 'person');

  // OrdinalBinPrompts/PromptFields.tsx renders the shared `PromptText`
  // component (`~/components/sections/PromptText`, the SAME component
  // NameGenerator's prompt dialogs use) rather than a bespoke RichText field
  // like the census family's `PromptFields.tsx` — its `label` prop is
  // `'Prompt text'` (lowercase "text"), confirmed against that component's
  // source rather than assumed from another interface's capitalisation.
  //
  // The "Ordinal Variable" `VariablePicker`'s `onCreateOption` is wired to
  // `handleNewVariable = (name) => openNewVariableWindow({ initialValues: {
  // name, type: 'ordinal' } }, { field: 'variable' })` — byte-for-byte the
  // same pre-locked-type pattern TieStrengthCensus's `edgeVariable` picker
  // uses (task 17). So `createVariableWithOptions`'s existing
  // `typeCombobox.isEnabled()` branch again takes the disabled path: this is
  // OrdinalBin's *second* live exercise of that branch, not a first for the
  // "must click through the combobox" path — that remains unverified by any
  // bin/census interface discovered so far.
  await addPrompt(editor.section('Prompts'), async () => {
    await editor.fillRichText('Prompt text', 'Rank these');
    await createVariableViaSpotlight(architectPage, { variableName: 'rank' });
    await createVariableWithOptions(architectPage, {
      variableName: 'rank',
      options: ['Low', 'High'],
      type: 'ordinal',
    });
    // `color` is deliberately left untouched: OrdinalBinPrompts.tsx's
    // DialogArrayField sets `itemTemplate: () => ({ color:
    // 'ord-color-seq-1' })`, so a brand-new prompt item's `color` is already
    // populated the moment the "Create new" dialog opens — the required
    // `ColorPicker` field never blocks the save.
  });

  await editor.expectNoIssues();
  await editor.save();

  const stage = await readStageJson(architectPage, 0);
  expect(stage.type).toBe('OrdinalBin');

  const { prompts } = stage;
  if (!Array.isArray(prompts) || prompts.length !== 1) {
    throw new Error('expected exactly one saved OrdinalBin prompt');
  }
  const [prompt] = prompts;
  if (
    typeof prompt !== 'object' ||
    prompt === null ||
    !('variable' in prompt) ||
    typeof prompt.variable !== 'string'
  ) {
    throw new Error(
      `saved OrdinalBin prompt is missing a string "variable": ${JSON.stringify(prompt)}`,
    );
  }
  expect(prompt.variable).not.toBe('');

  // Confirm `createVariableWithOptions` actually persisted the ordinal
  // variable + its two options into the codebook (not just the prompt's
  // `variable` reference).
  const protocol = await readProtocolJson(architectPage);
  const codebookVariable = findNodeCodebookVariable(protocol, prompt.variable);
  expect(codebookVariable.type).toBe('ordinal');
  expect(codebookVariable.options?.map((option) => option.label)).toEqual([
    'Low',
    'High',
  ]);

  expect(stageSnapshotJson(stage)).toMatchSnapshot('ordinal-bin-stage.json');
});
