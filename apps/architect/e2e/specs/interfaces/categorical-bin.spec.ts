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
// separately) for the given variable id — confirms the prompt dialog's create
// row actually persisted the attribute + its values into the codebook, not
// just closed its editor without error.
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

  // The subject picker (@codaco/protocol-builder's `subjectPicker({ entity:
  // 'node', filter: true })`): CategoricalBin's editor is
  // `[stageHeading, subjectPicker, categoricalBinPrompts, skipLogic,
  // interviewerGuidance]` — no introduction section.
  await selectOrCreateNodeType(architectPage, 'person');

  // The shared `PromptTextField` the whole census/bin family renders
  // (`label: 'Prompt text'`, censusMessages.promptTextLabel).
  //
  // "The bins" is a `BinAttributeField`: a picker over the node type's
  // existing categorical attributes, whose own create row is the only way to
  // invent one. A bin attribute IS its list of values — the schema refuses
  // fewer than two — so the row cannot finish it from a name and escalates to
  // the codebook's own editor (VariableEditor), titled "Create a new
  // attribute" and opened with `allowedVariableTypes: ['categorical']`, so its
  // "Attribute type" select is already on Categorical and is never touched
  // here. Nothing is pre-seeded, so both value rows are added below.
  await addPrompt(editor.field('prompts'), async () => {
    await editor.fillRichText('Prompt text', 'Group these');
    await createAttribute(editor.field('variable'), 'group', {
      title: 'Create a new attribute',
      author: authorOptions([
        { label: 'Family', value: 'family' },
        { label: 'Friends', value: 'friends' },
      ]),
    });
    // Deliberately NOT switching on the "A bin for anything else" section
    // (`toggleable`, `defaultOpen={committedOther !== undefined}` — closed
    // here since `otherVariable` is unset): opening it would add three more
    // required fields (`otherVariable`, `otherOptionLabel`,
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
  // The untouched "A bin for anything else" fields must not have leaked in.
  expect(prompt).not.toHaveProperty('otherVariable');

  // Confirm the attribute editor actually persisted the categorical attribute
  // + its two values into the codebook (not just the prompt's `variable`
  // reference).
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
