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

test('creates a valid CategoricalBin stage from scratch', async ({
  architectPage,
  seed,
}) => {
  await seed(emptyProtocol());
  await gotoProtocol(architectPage);

  const editor = new StageEditor(architectPage);
  await editor.createNew('CategoricalBin');
  await editor.setStageName('Group These');

  // FilteredNodeType (StageEditor/Interfaces.tsx: CategoricalBin's sections
  // are `[FilteredNodeType, CategoricalBinPrompts, SkipLogic,
  // InterviewScript]` — no IntroductionPanel).
  await selectOrCreateNodeType(architectPage, 'person');

  // Same shared `PromptText` component as OrdinalBin (`label: 'Prompt
  // text'`). CategoricalBinPrompts/PromptFields.tsx's "Categorical
  // Variable" `VariablePicker` wires `onCreateOption` to `handleNewVariable
  // = (name) => openNewVariableWindow({ initialValues: { name, type:
  // 'categorical' } }, { field: 'variable' })` — the same pre-locked-type
  // NewVariableWindow pattern as OrdinalBin/TieStrengthCensus, so
  // `createVariableWithOptions` again takes the disabled-combobox branch.
  await addPrompt(editor.section('Prompts'), async () => {
    await editor.fillRichText('Prompt text', 'Group these');
    await createVariableViaSpotlight(architectPage, { variableName: 'group' });
    await createVariableWithOptions(architectPage, {
      variableName: 'group',
      options: ['Family', 'Friends'],
      type: 'categorical',
    });
    // Deliberately NOT expanding the "Follow-up 'Other' Option" section
    // (`toggleable`, `startExpanded={!!otherVariable}` — collapsed by
    // default here since `otherVariable` is unset): expanding it would add
    // three more required fields (`otherVariable`, `otherOptionLabel`,
    // `otherVariablePrompt`) this spec doesn't need to exercise. There is no
    // `color` field on CategoricalBin at all (unlike OrdinalBin).
  });

  await editor.expectNoIssues();
  await editor.save();

  const stage = await readStageJson(architectPage, 0);
  if (stage.type !== 'CategoricalBin') {
    throw new Error(`expected CategoricalBin stage, got ${stage.type}`);
  }

  const { prompts } = stage;
  if (!Array.isArray(prompts) || prompts.length !== 1) {
    throw new Error('expected exactly one saved CategoricalBin prompt');
  }
  const [prompt] = prompts;
  if (
    typeof prompt !== 'object' ||
    prompt === null ||
    !('variable' in prompt) ||
    typeof prompt.variable !== 'string'
  ) {
    throw new Error(
      `saved CategoricalBin prompt is missing a string "variable": ${JSON.stringify(prompt)}`,
    );
  }
  expect(prompt.variable).not.toBe('');
  // The untouched "Follow-up Other Option" fields must not have leaked in.
  expect(prompt).not.toHaveProperty('otherVariable');

  // Confirm `createVariableWithOptions` actually persisted the categorical
  // variable + its two options into the codebook (not just the prompt's
  // `variable` reference).
  const protocol = await readProtocolJson(architectPage);
  const codebookVariable = findNodeCodebookVariable(protocol, prompt.variable);
  expect(codebookVariable.type).toBe('categorical');
  expect(codebookVariable.options?.map((option) => option.label)).toEqual([
    'Family',
    'Friends',
  ]);

  expect(await stageSnapshotJson(stage)).toMatchSnapshot(
    'categorical-bin-stage.json',
  );
});
