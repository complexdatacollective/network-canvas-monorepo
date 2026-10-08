import { expect, gotoProtocol, test } from '../../fixtures/architect-test.js';
import { emptyProtocol } from '../../fixtures/seed.js';
import { stageSnapshotJson } from '../../helpers/normalize-stage.js';
import { readStageJson } from '../../helpers/read-store.js';
import { StageEditor } from '../../pageobjects/stage-editor.js';
import { Timeline } from '../../pageobjects/timeline.js';

/**
 * The finish stage is never created from the New Stage screen: a protocol is
 * made with one, and keeps it. So this spec edits the one `emptyProtocol()`
 * starts with — the stage Architect's New Protocol writes — rather than
 * creating one from scratch.
 */
test('edits the finish stage a new protocol starts with', async ({
  architectPage,
  seed,
}) => {
  await seed(emptyProtocol());
  await gotoProtocol(architectPage);
  await new Timeline(architectPage).openStage('Finish Interview');

  const editor = new StageEditor(architectPage);
  await editor.setStageName('Not eligible');

  // FinishSession's sections are `[stageHeading, closingScreen, outcome,
  // interviewerGuidance]` (`@codaco/protocol-builder`'s
  // `editors/finish-session/FinishSessionStageEditor.ts`); no skip logic,
  // because every route through the interview ends at a finish stage.
  await expect(editor.section('Skip Logic')).toHaveCount(0);

  const heading = editor
    .field('title')
    .getByRole('textbox', { name: 'Heading', exact: true });
  await expect(heading).toBeEditable();
  await heading.fill('Thank you for your interest');

  const text = editor
    .field('content')
    .getByRole('textbox', { name: 'Text', exact: true });
  await expect(text).toBeEditable();
  await text.fill('This study is not looking for more people like you.');

  await editor
    .field('outcome')
    .getByRole('option', { name: /^Ineligible/ })
    .click();

  await editor.expectNoIssues();
  await editor.save();

  const stage = await readStageJson(architectPage, 0);
  if (stage.type !== 'FinishSession') {
    throw new Error(`expected FinishSession stage, got ${stage.type}`);
  }
  expect(stage).toMatchObject({
    id: 'finish',
    label: { en: 'Not eligible' },
    title: { en: 'Thank you for your interest' },
    content: { en: 'This study is not looking for more people like you.' },
    outcome: 'ineligible',
  });
  expect(stage).not.toHaveProperty('skipLogic');

  expect(await stageSnapshotJson(stage)).toMatchSnapshot(
    'finish-session-stage.json',
  );
});
