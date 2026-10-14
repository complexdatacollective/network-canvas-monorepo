import { expect, gotoProtocol, test } from '../../fixtures/architect-test.js';
import { emptyProtocol } from '../../fixtures/seed.js';
import { stageSnapshotJson } from '../../helpers/normalize-stage.js';
import { readStageJson } from '../../helpers/read-store.js';
import { StageEditor } from '../../pageobjects/stage-editor.js';
import { Timeline } from '../../pageobjects/timeline.js';

/**
 * Every protocol is made with a finish stage, and keeps at least one. A
 * further finish stage can be added from the New Stage screen, but this spec
 * edits the one `emptyProtocol()` starts with — the stage Architect's New
 * Protocol writes — so it also covers the supplied text that stage carries.
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

  // FinishSession's sections are `[stageHeading, mode, closingScreen,
  // finishedScreen, finishing, outcome, interviewerGuidance]`
  // (`@codaco/protocol-builder`'s
  // `editors/finish-session/FinishSessionStageEditor.ts`); no skip logic,
  // because every route through the interview ends at a finish stage.
  await expect(editor.section('Skip Logic')).toHaveCount(0);

  // The heading is no longer a field of its own: it is part of the closing
  // text's markdown. A new protocol's stage asks participants to confirm, so
  // its closing screen is there to edit.
  await expect(
    editor.field('mode').getByRole('option', { name: /^Participants confirm/ }),
  ).toHaveAttribute('aria-selected', 'true');
  await expect(editor.field('title')).toHaveCount(0);

  const text = editor
    .field('content')
    .getByRole('textbox', { name: 'Closing text', exact: true });
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
    mode: 'confirmation',
    content: { en: 'This study is not looking for more people like you.' },
    outcome: 'ineligible',
  });
  expect(stage).not.toHaveProperty('skipLogic');
  expect(stage).not.toHaveProperty('title');
  expect(stage.finishedContent).toEqual({
    en: '# Interview Finished\n\nThank you for participating!',
  });

  expect(await stageSnapshotJson(stage)).toMatchSnapshot(
    'finish-session-stage.json',
  );
});
