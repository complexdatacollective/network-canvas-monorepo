import { expect, gotoProtocol, test } from '../../fixtures/architect-test.js';
import { emptyProtocol } from '../../fixtures/seed.js';
import { stageSnapshotJson } from '../../helpers/normalize-stage.js';
import { readProtocolJson, readStageJson } from '../../helpers/read-store.js';
import { selectOrCreateNodeType } from '../../pageobjects/editor-sections/entity-types.js';
import { addPrompt } from '../../pageobjects/editor-sections/prompts.js';
import {
  authorOptions,
  createAttribute,
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
// separately) for the given variable id — confirms the prompt dialog's
// create-row flow actually persisted the attribute + its values
// into the codebook, not just closed its editor without error.
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

  // The subject picker (@codaco/protocol-builder's `subjectPicker({ entity:
  // 'node', filter: true })`): OrdinalBin's editor is
  // `[stageHeading, subjectPicker, ordinalBinPrompts, skipLogic,
  // interviewerGuidance]` — no introduction section, unlike the two pairwise
  // censuses.
  await selectOrCreateNodeType(architectPage, 'person');

  // The shared `PromptTextField` the whole census/bin family renders
  // (`label: 'Prompt text'`, censusMessages.promptTextLabel).
  //
  // "Ordinal response" is the same `BinAttributeField` CategoricalBin uses, only
  // asking for an ordinal attribute: a picker over what the node type already
  // has, whose own create row is the only way to invent one. A scale IS its
  // list of values, so the row escalates to the codebook's attribute editor —
  // titled "Create a new attribute" and opened with `allowedVariableTypes:
  // ['ordinal']`, so its "Attribute type" select is already on Ordinal and is
  // never touched here.
  await addPrompt(editor.field('prompts'), async () => {
    await editor.fillRichText('Prompt text', 'Rank these');
    await createAttribute(editor.field('variable'), 'rank', {
      title: 'Create a new attribute',
      author: authorOptions([
        { label: 'Low', value: 'low' },
        { label: 'High', value: 'high' },
      ]),
    });
    // The "Color gradient" section is deliberately left untouched:
    // OrdinalBinPromptsSection.tsx passes `itemTemplate: () => ({ color:
    // FIRST_ORDINAL_COLOR })` to the shared prompts section, so a brand-new
    // prompt row already carries `ord-color-seq-1` the moment its dialog
    // opens — the required `ColorPicker` field never blocks the save.
  });

  await editor.expectNoIssues();
  await editor.save();

  const stage = await readStageJson(architectPage, 0);
  if (stage.type !== 'OrdinalBin') {
    throw new Error(`expected OrdinalBin stage, got ${stage.type}`);
  }

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

  // Confirm the attribute editor actually persisted the ordinal attribute +
  // its two values into the codebook (not just the prompt's `variable`
  // reference).
  const protocol = await readProtocolJson(architectPage);
  const codebookVariable = findNodeCodebookVariable(protocol, prompt.variable);
  expect(codebookVariable.type).toBe('ordinal');
  expect(codebookVariable.options?.map((option) => option.label)).toEqual([
    'Low',
    'High',
  ]);

  expect(await stageSnapshotJson(stage)).toMatchSnapshot(
    'ordinal-bin-stage.json',
  );
});
