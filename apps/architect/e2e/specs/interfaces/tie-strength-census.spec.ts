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

type TieStrengthPrompt = {
  id: string;
  text: string;
  createEdge: string;
  edgeVariable: string;
  negativeLabel: string;
};

// Narrow one element of the saved `prompts` array with a real runtime guard
// (mirroring `toStage` in timeline.spec.ts) rather than an `as` cast: the
// schema (`tieStrengthCensusPromptSchema`, a `z.strictObject`) rejects any
// extra key, and the row dialog assembles what it commits from whatever is
// mounted inside it (`documentFromSubmission`, then the prompts section's own
// `withoutAbsentValues` normalise). Asserting this exact key set is a real
// check that nothing the dialog rendered — the attribute editor's draft, an
// untouched optional group — rode into the committed row, not just that the
// stage saved successfully.
function toTieStrengthPrompt(value: unknown): TieStrengthPrompt {
  if (
    typeof value === 'object' &&
    value !== null &&
    'id' in value &&
    typeof value.id === 'string' &&
    'text' in value &&
    typeof value.text === 'string' &&
    'createEdge' in value &&
    typeof value.createEdge === 'string' &&
    'edgeVariable' in value &&
    typeof value.edgeVariable === 'string' &&
    'negativeLabel' in value &&
    typeof value.negativeLabel === 'string' &&
    Object.keys(value).length === 5
  ) {
    return {
      id: value.id,
      text: value.text,
      createEdge: value.createEdge,
      edgeVariable: value.edgeVariable,
      negativeLabel: value.negativeLabel,
    };
  }
  throw new Error(
    `saved TieStrengthCensus prompt has an unexpected shape: ${JSON.stringify(value)}`,
  );
}

test('creates a valid TieStrengthCensus stage from scratch', async ({
  architectPage,
  seed,
}) => {
  await seed(emptyProtocol());
  await gotoProtocol(architectPage);

  const editor = new StageEditor(architectPage);
  await editor.createNew('TieStrengthCensus');
  await editor.setStageName('How Strong Is This Tie?');

  // Same subject picker + shared `introduction()` section as DyadCensus
  // (TieStrengthCensusStageEditor.ts composes `[stageHeading, subjectPicker,
  // introduction, tieStrengthCensusPrompts, skipLogic,
  // interviewerGuidance]`).
  await selectOrCreateNodeType(architectPage, 'person');
  await editor
    .field('introductionPanel.title')
    .getByRole('textbox')
    .fill('How Strong Is This Tie?');
  await editor.fillRichText(
    'Introduction text',
    'We would like to ask you how close you are with the people you know.',
  );

  // TieStrengthCensusPromptsSection.tsx is the heaviest prompt editor in the
  // census family. Its row dialog holds four groups:
  //
  // - "Participant prompt": the family's shared `PromptTextField`
  //   (`label: 'Prompt text'`).
  // - "Connection rated": the same `CreateEdgeField` the two dyad censuses
  //   use, so the connection type is invented through the codebook entity
  //   editor ("Edge type name", committed by "Save entity").
  // - "The scale": an ordinal attribute OF that connection type. `ScaleField`
  //   renders nothing at all until `createEdge` holds a real type id
  //   (`edgeSubjectOf` answers `undefined` for anything that is not a
  //   non-empty string), so waiting for that section is a genuine check that
  //   the created edge-type id — not a pending Promise, not an object — became
  //   the form value before the attribute is created against it. The
  //   attribute itself comes from the picker's own create row, which escalates
  //   to the codebook attribute editor — titled "Create a new attribute" and
  //   opened with `allowedVariableTypes: ['ordinal']`, so its "Attribute type"
  //   select is already on Ordinal and is never touched here.
  // - "Answering that there is no connection": a RichText "Decline answer".
  //
  // Nothing mirrors the attribute's values onto the prompt any more, so there
  // is no draft-only key to strip; `toTieStrengthPrompt` below asserts the
  // committed row is exactly the five keys the schema names.
  await addPrompt(editor.field('prompts'), async () => {
    await editor.fillRichText('Prompt text', 'How close are you?');

    // Both codebook editors open as dialogs over the prompt dialog, and each
    // holds itself open until its write lands, renaming its submit while the
    // request is in flight — so the DIALOG going is the signal, not the
    // button, and everything typed into one is scoped to it.
    const edgeTypeEditor = architectPage.getByRole('dialog', {
      name: 'Create new edge type',
      exact: true,
    });
    await architectPage
      .getByRole('button', {
        name: 'Create new edge type',
        exact: true,
      })
      .click();
    await edgeTypeEditor
      .getByRole('textbox', { name: 'Edge type name', exact: true })
      .fill('close');
    await edgeTypeEditor
      .getByRole('button', { name: 'Save entity', exact: true })
      .click();
    await edgeTypeEditor.waitFor({ state: 'hidden' });

    await expect(editor.section('The scale')).toBeVisible();

    // The scale attribute is invented from the picker's own create row, which
    // escalates to the codebook's editor because a scale IS its list of
    // values. The edge type above still has a create button of its own — an
    // edge type is not an attribute — so only the attribute half changed.
    await createAttribute(editor.field('edgeVariable'), 'strength', {
      title: 'Create a new attribute',
      author: authorOptions([
        { label: 'Low', value: 'low' },
        { label: 'High', value: 'high' },
      ]),
    });

    await editor.fillRichText('Decline answer', 'We are not close');
  });

  await editor.expectNoIssues();
  await editor.save();

  const stage = await readStageJson(architectPage, 0);
  if (stage.type !== 'TieStrengthCensus') {
    throw new Error(`expected TieStrengthCensus stage, got ${stage.type}`);
  }

  const { prompts } = stage;
  if (!Array.isArray(prompts) || prompts.length !== 1) {
    throw new Error('expected exactly one saved TieStrengthCensus prompt');
  }
  const prompt = toTieStrengthPrompt(prompts[0]);
  expect(prompt.text).toContain('How close are you?');
  expect(prompt.negativeLabel).toContain('We are not close');

  const protocol = await readProtocolJson(architectPage);
  expect(protocol.codebook.edge?.[prompt.createEdge]?.name).toBe('close');
  expect(Object.keys(protocol.codebook.edge ?? {})).not.toContain(
    '[object Promise]',
  );

  expect(await stageSnapshotJson(stage)).toMatchSnapshot(
    'tie-strength-census-stage.json',
  );
});
