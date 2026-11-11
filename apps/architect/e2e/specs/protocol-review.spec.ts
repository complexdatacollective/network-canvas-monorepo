import { readFile } from 'node:fs/promises';

import type { BrowserContext, Locator, Page } from '@playwright/test';
import JSZip from 'jszip';

import type { CurrentProtocol } from '@codaco/protocol-validation';

import { SESSION_PREFIX } from '../../src/utils/storageNames.js';
import { expect, gotoProtocol, test } from '../fixtures/architect-test.js';
import {
  FINDINGS,
  mockReviewService,
  NEW_P1_TEXT,
  NEW_P2_TEXT,
  OLD_P1_TEXT,
  OLD_P2_TEXT,
  REVIEW_ID,
  reviewProtocol,
  reviewProtocolWithDetails,
} from '../fixtures/protocol-review.js';
import { readProtocolJson } from '../helpers/read-store.js';
import { Toolbar } from '../pageobjects/toolbar.js';

// The Automated Protocol Review experiment, end to end, against the production
// build. The review service is never reached: its origin (the one the built
// app's Content-Security-Policy allows) is answered by `mockReviewService`,
// whose findings address the seeded protocol's real stage and prompt ids, so
// "Fix for me" really edits the protocol and the saved row shows it.

const RESULT_REVIEW = { kind: 'result', findings: FINDINGS } as const;

const reviewButton = (page: Page) =>
  page.getByRole('button', { name: /^Review protocol|^Reviewing/ });

const popoverOf = (page: Page) =>
  page.getByRole('dialog', { name: 'Protocol review' });

const problemList = (popover: Locator) =>
  popover.getByRole('list', { name: 'Problems found' });

const problemRow = (popover: Locator, title: string) =>
  problemList(popover).getByRole('listitem').filter({ hasText: title });

const problemDialog = (page: Page, title: string) =>
  page.getByRole('dialog', { name: title });

const countName = (count: number) =>
  `Review protocol, ${count} ${count === 1 ? 'problem' : 'problems'} still to decide`;

const mainNav = (page: Page) =>
  page.getByRole('navigation', { name: 'Main navigation' });

const reviewSwitch = (page: Page) =>
  page.getByRole('switch', { name: 'Automated Protocol Review' });

async function openExperimentsPage(page: Page) {
  await mainNav(page)
    .getByRole('link', { name: 'Experimental features' })
    .click();
  await expect(page).toHaveURL(/\/protocol\/experiments$/);
  await expect(
    page.getByRole('heading', { name: 'Experimental features', level: 1 }),
  ).toBeVisible();
}

async function openStages(page: Page) {
  await mainNav(page).getByRole('link', { name: 'Stages' }).click();
  await expect(page).toHaveURL(/\/protocol$/);
  await expect(
    page.getByRole('heading', { name: 'Stages', level: 1 }),
  ).toBeVisible();
}

/** The first text of the default language of a stage's prompt, as saved. */
function promptText(protocol: CurrentProtocol, promptId: string) {
  for (const stage of protocol.stages) {
    if (!('prompts' in stage)) continue;
    const prompt = stage.prompts.find((candidate) => candidate.id === promptId);
    if (prompt && 'text' in prompt) return prompt.text;
  }
  throw new Error(`no prompt ${promptId} in the saved protocol`);
}

function namesStage(protocol: CurrentProtocol) {
  const stage = protocol.stages.find((candidate) => candidate.id === 'names');
  if (!stage) throw new Error('no names stage in the saved protocol');
  return stage;
}

/** Opens the popover and starts a review of a protocol that has study details. */
async function startReview(page: Page) {
  await reviewButton(page).click();
  const popover = popoverOf(page);
  await popover.getByRole('button', { name: 'Start review' }).click();
  await expect(reviewButton(page)).toHaveAccessibleName(
    countName(FINDINGS.length),
  );
  return popover;
}

/** Seeds a protocol with study details, opens it and gets a finished review. */
async function reviewedProtocol(
  page: Page,
  seed: (protocol: CurrentProtocol) => Promise<string>,
  context: BrowserContext,
) {
  const service = await mockReviewService(context, RESULT_REVIEW);
  await seed(reviewProtocolWithDetails());
  await gotoProtocol(page);
  const popover = await startReview(page);
  return { service, popover };
}

async function openProblem(page: Page, popover: Locator, title: string) {
  await problemRow(popover, title)
    .getByRole('button', { name: new RegExp(title) })
    .click();
  const dialog = problemDialog(page, title);
  await expect(dialog).toBeVisible();
  return dialog;
}

async function closeProblemDialog(dialog: Locator) {
  await dialog.getByRole('button', { name: 'Close' }).click();
  await expect(dialog).toBeHidden();
}

test.describe('turning the experiment on and off', () => {
  test('the nav icon reaches the page; on adds the button, off removes it', async ({
    architectPage: page,
    seed,
  }) => {
    await seed(reviewProtocol());
    await gotoProtocol(page);
    // Not vacuous: the Stages screen is up (its Export action is there)
    // before the button is declared missing.
    await expect(
      page.getByRole('toolbar', { name: 'Page actions' }).getByRole('button', {
        name: 'Export',
      }),
    ).toBeVisible();
    await expect(reviewButton(page)).toHaveCount(0);

    await openExperimentsPage(page);
    await expect(reviewSwitch(page)).not.toBeChecked();
    await reviewSwitch(page).click();
    await expect(reviewSwitch(page)).toBeChecked();
    await readProtocolJson(
      page,
      (protocol) => protocol.experiments?.protocolReview !== undefined,
    );

    await openStages(page);
    await expect(reviewButton(page)).toBeVisible();

    // No study details yet, so turning it off asks nothing.
    await openExperimentsPage(page);
    await reviewSwitch(page).click();
    await expect(reviewSwitch(page)).not.toBeChecked();
    await expect(
      page.getByRole('dialog', { name: 'Turn off Automated Protocol Review?' }),
    ).toHaveCount(0);
    await readProtocolJson(
      page,
      (protocol) => protocol.experiments?.protocolReview === undefined,
    );
    await openStages(page);
    await expect(reviewButton(page)).toHaveCount(0);
  });

  test('turning it off with study details asks first, then removes them from the protocol', async ({
    architectPage: page,
    seed,
  }) => {
    await seed(reviewProtocolWithDetails());
    await gotoProtocol(page);
    await expect(reviewButton(page)).toBeVisible();
    await openExperimentsPage(page);
    await expect(reviewSwitch(page)).toBeChecked();

    // Cancel: the switch stays on and the details stay saved.
    await reviewSwitch(page).click();
    const dialog = page.getByRole('dialog', {
      name: 'Turn off Automated Protocol Review?',
    });
    await expect(dialog).toBeVisible();
    await expect(
      dialog.getByText(
        'The study details saved in this protocol for Automated Protocol Review will be removed.',
      ),
    ).toBeVisible();
    await dialog.getByRole('button', { name: 'Cancel' }).click();
    await expect(dialog).toBeHidden();
    await expect(reviewSwitch(page)).toBeChecked();
    const kept = await readProtocolJson(page);
    expect(kept.experiments?.protocolReview).toMatchObject({
      studyContext: {
        researchQuestions: ['Who do older adults turn to for advice?'],
      },
    });

    // Confirm: the switch goes off and nothing of the details is left.
    await reviewSwitch(page).click();
    await dialog
      .getByRole('button', { name: 'Turn off and remove details' })
      .click();
    await expect(reviewSwitch(page)).not.toBeChecked();
    const removed = await readProtocolJson(
      page,
      (protocol) => protocol.experiments?.protocolReview === undefined,
    );
    expect(removed.experiments?.protocolReview).toBeUndefined();
    expect(JSON.stringify(removed)).not.toContain('Adults over 65');
    expect(JSON.stringify(removed)).not.toContain('researchQuestions');

    await openStages(page);
    await expect(reviewButton(page)).toHaveCount(0);
  });

  test('the button is not offered while the experiment is off', async ({
    architectPage: page,
    seed,
  }) => {
    await seed(reviewProtocol());
    await gotoProtocol(page);
    await expect(
      page.getByRole('list', { name: 'Protocol stages' }),
    ).toBeVisible();
    await expect(reviewButton(page)).toHaveCount(0);
  });

  test('the button is not offered in a tab that can only read the protocol', async ({
    architectPage: page,
    context,
    seed,
  }) => {
    const protocolId = await seed(reviewProtocolWithDetails());
    await gotoProtocol(page);
    // The first tab holds the protocol, so it has the button (the control
    // that proves the second tab's absence is about its mode).
    await expect(reviewButton(page)).toBeVisible();

    // sessionStorage is per tab: give the second tab the active protocol id
    // the library would have set, as `protocol-route-guard.spec.ts` does.
    const secondTab = await context.newPage();
    await secondTab.goto('/');
    await secondTab.evaluate(
      ({ storageId, sessionPrefix }) => {
        sessionStorage.setItem(
          `${sessionPrefix}app`,
          JSON.stringify({ activeProtocolId: storageId }),
        );
      },
      { storageId: protocolId, sessionPrefix: SESSION_PREFIX },
    );
    await secondTab.goto('/protocol');
    await expect(
      secondTab.getByRole('status').filter({
        hasText: 'This protocol is open in another tab',
      }),
    ).toBeVisible();
    await expect(
      secondTab.getByRole('button', { name: /^View stage 1:/ }),
    ).toBeVisible();
    await expect(reviewButton(secondTab)).toHaveCount(0);
  });
});

test.describe('first use', () => {
  test('the wizard validates each step, takes any number of questions, then saves the details and sends one request', async ({
    architectPage: page,
    context,
    seed,
  }) => {
    const service = await mockReviewService(context, RESULT_REVIEW);
    const experimentOn: CurrentProtocol = {
      ...reviewProtocol(),
      experiments: { protocolReview: {} },
    };
    await seed(experimentOn);
    await gotoProtocol(page);

    await reviewButton(page).click();
    const step = (name: string) => page.getByRole('heading', { name });
    await expect(step('What are your research questions?')).toBeVisible();
    // The popover is not what opened: there are no study details yet.
    await expect(popoverOf(page)).toHaveCount(0);

    // Step 1 cannot be passed empty.
    await page.getByRole('button', { name: 'Continue' }).click();
    await expect(
      page.getByText('Write a research question here, or remove this one.'),
    ).toBeVisible();
    await expect(step('What are your research questions?')).toBeVisible();

    // No limit: three more questions are added. Each new box takes focus and
    // is wholly on screen, although by the fourth the step is taller than the
    // dialog and scrolls.
    for (const number of [2, 3, 4]) {
      await page
        .getByRole('button', { name: 'Add a research question' })
        .click();
      const added = page.getByRole('textbox', {
        name: `Research question ${number}`,
      });
      await expect(added).toBeFocused();
      await expect(added).toBeInViewport({ ratio: 1 });
    }
    const questions = [
      'Who do older adults turn to for advice?',
      'How often do they speak to each person?',
      'Which advisers know each other?',
      'Does advice differ by topic?',
    ];
    for (const [index, question] of questions.entries()) {
      await page
        .getByRole('textbox', { name: `Research question ${index + 1}` })
        .fill(question);
    }
    await expect(
      page.getByRole('textbox', { name: /^Research question \d+$/ }),
    ).toHaveCount(4);
    await page.getByRole('button', { name: 'Continue' }).click();

    // Step 2 cannot be passed empty either, and says what is missing.
    await expect(step('Who takes part, and how?')).toBeVisible();
    await page.getByRole('button', { name: 'Continue' }).click();
    await expect(
      page.getByText('Describe who will be interviewed.'),
    ).toBeVisible();
    await expect(
      page.getByText('Choose how the interview is administered.'),
    ).toBeVisible();
    await expect(step('Who takes part, and how?')).toBeVisible();
    await page
      .getByRole('textbox', { name: 'Research population' })
      .fill('Adults over 65 living alone');
    await page.getByRole('option', { name: /^Face to face/ }).click();
    await page.getByRole('button', { name: 'Continue' }).click();

    // Step 3 is optional.
    await expect(step('Describe the study')).toBeVisible();
    await page.getByRole('button', { name: 'Continue' }).click();

    // Step 4 says what is sent; nothing has been sent yet.
    await expect(step('Before your protocol is sent')).toBeVisible();
    expect(service.bodies).toHaveLength(0);
    await page.getByRole('button', { name: 'Start review' }).click();

    await expect(reviewButton(page)).toHaveAccessibleName(
      countName(FINDINGS.length),
    );
    expect(service.bodies).toHaveLength(1);
    const [body] = service.bodies;
    if (!body) throw new Error('no review request was recorded');

    expect(body.installationId).toMatch(
      /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i,
    );
    expect(body.share).toBe(false);
    expect(body.locale).toBe('en');
    expect(body.studyContext).toMatchObject({
      researchQuestions: questions,
      population: 'Adults over 65 living alone',
      administration: 'face_to_face',
    });
    // The protocol goes without its experiments (the study details travel
    // separately), and is otherwise the protocol the researcher is editing.
    expect(Object.keys(body.protocol)).not.toContain('experiments');
    expect(JSON.stringify(body.protocol)).not.toContain('Adults over 65');
    expect(body.protocol.name).toBe('Advice study');
    expect(body.protocol.stages).toEqual(reviewProtocol().stages);

    const saved = await readProtocolJson(page, (protocol) =>
      JSON.stringify(protocol.experiments?.protocolReview).includes(
        '"studyContext"',
      ),
    );
    expect(saved.experiments?.protocolReview).toMatchObject({
      studyContext: {
        researchQuestions: questions,
        population: 'Adults over 65 living alone',
        administration: 'face_to_face',
      },
    });

    // The results are on screen.
    const popover = popoverOf(page);
    await expect(problemList(popover).getByRole('listitem')).toHaveCount(
      FINDINGS.length,
    );
  });
});

test.describe('results', () => {
  test('the button counts what is still to decide; the popover lists problems most serious first', async ({
    architectPage: page,
    context,
    seed,
  }) => {
    const { popover } = await reviewedProtocol(page, seed, context);

    await expect(
      popover.getByText(/Reviewed today at .* · 4 problems, 4 still to decide/),
    ).toBeVisible();
    const rows = problemList(popover).getByRole('listitem');
    await expect(rows).toHaveCount(4);
    await expect(rows).toHaveText([
      /The first prompt is vague\s*Serious · Stage 2 · Names/,
      /The second prompt has no limit on how many to name\s*Worth fixing · Stage 2 · Names/,
      /The closing stage repeats the welcome\s*Worth fixing · Stage 3 · Finish/,
      /Nothing answers the research question\s*Suggestion · Whole protocol/,
    ]);
    await expect(
      popover.getByRole('button', { name: 'Go through 4 problems' }),
    ).toBeVisible();
  });

  test('Fix for me rewrites the prompt, marks it Fixed for you, and the problem’s Undo restores the old text', async ({
    architectPage: page,
    context,
    seed,
  }) => {
    const { popover } = await reviewedProtocol(page, seed, context);
    const title = 'The first prompt is vague';

    const dialog = await openProblem(page, popover, title);
    await expect(dialog.getByText('Problem 1 of 4')).toBeVisible();
    await expect(dialog.getByText('Now', { exact: true })).toBeVisible();
    await expect(dialog.getByText(OLD_P1_TEXT, { exact: true })).toBeVisible();
    await expect(
      dialog.getByText('After the fix', { exact: true }),
    ).toBeVisible();
    await expect(dialog.getByText(NEW_P1_TEXT, { exact: true })).toBeVisible();
    await expect(
      dialog.getByText(
        'This protocol also has this text in French. Fix for me does not change that version, so check it after the fix.',
      ),
    ).toBeVisible();

    await dialog.getByRole('button', { name: 'Fix for me' }).click();
    // On to the next problem.
    await expect(
      problemDialog(page, 'The second prompt has no limit on how many to name'),
    ).toBeVisible();

    const fixed = await readProtocolJson(
      page,
      (protocol) => promptText(protocol, 'p1')?.en === NEW_P1_TEXT,
    );
    // Only the default language's entry changes.
    expect(promptText(fixed, 'p1')).toEqual({ en: NEW_P1_TEXT, fr: 'Nommez' });
    await closeProblemDialog(
      problemDialog(page, 'The second prompt has no limit on how many to name'),
    );
    // (The page behind an open dialog is hidden from the accessibility tree,
    // so the button is read once the dialog is closed.)
    await expect(reviewButton(page)).toHaveAccessibleName(countName(3));
    await reviewButton(page).click();
    const row = problemRow(popover, title);
    await expect(row.getByText('Fixed for you')).toBeVisible();

    await row.getByRole('button', { name: 'Undo' }).click();
    await expect(row.getByText('Fixed for you')).toHaveCount(0);
    const undone = await readProtocolJson(
      page,
      (protocol) => promptText(protocol, 'p1')?.en === OLD_P1_TEXT,
    );
    expect(promptText(undone, 'p1')).toEqual({ en: OLD_P1_TEXT, fr: 'Nommez' });
    await expect(reviewButton(page)).toHaveAccessibleName(countName(4));
  });

  test('a structurally valid fix changes the prompt and the stage setting, and Undo takes both back out', async ({
    architectPage: page,
    context,
    seed,
  }) => {
    const { popover } = await reviewedProtocol(page, seed, context);
    const title = 'The second prompt has no limit on how many to name';

    const dialog = await openProblem(page, popover, title);
    await expect(
      dialog.getByText('Stage 2 · Names: require at least two names'),
    ).toBeVisible();
    await dialog.getByRole('button', { name: 'Fix for me' }).click();

    const fixed = await readProtocolJson(
      page,
      (protocol) => promptText(protocol, 'p2')?.en === NEW_P2_TEXT,
    );
    const stage = namesStage(fixed);
    expect('behaviours' in stage && stage.behaviours).toEqual({ minNodes: 2 });
    expect(promptText(fixed, 'p2')).toEqual({
      en: NEW_P2_TEXT,
      fr: 'Nommez plus',
    });

    await closeProblemDialog(
      problemDialog(page, 'The closing stage repeats the welcome'),
    );
    await reviewButton(page).click();
    await problemRow(popover, title)
      .getByRole('button', { name: 'Undo' })
      .click();
    const undone = await readProtocolJson(
      page,
      (protocol) => promptText(protocol, 'p2')?.en === OLD_P2_TEXT,
    );
    expect('behaviours' in namesStage(undone)).toBe(false);
    expect('minNodesNotice' in namesStage(undone)).toBe(false);
  });

  test('a fix that cannot be made is shown without an available Fix for me', async ({
    architectPage: page,
    context,
    seed,
  }) => {
    const { popover } = await reviewedProtocol(page, seed, context);
    const before = await readProtocolJson(page);

    const dialog = await openProblem(
      page,
      popover,
      'The closing stage repeats the welcome',
    );
    await expect(
      dialog.getByText(
        'This fix cannot be made for you. Make the change yourself, using the description below.',
      ),
    ).toBeVisible();
    const fix = dialog.getByRole('button', { name: 'Fix for me' });
    await expect(fix).toBeDisabled();
    // I will fix this is still on offer.
    await expect(
      dialog.getByRole('button', { name: 'I will fix this' }),
    ).toBeEnabled();
    // Forcing the click through the disabled state changes nothing.
    await fix.click({ force: true });
    await expect(dialog).toBeVisible();
    await closeProblemDialog(dialog);
    await expect(reviewButton(page)).toHaveAccessibleName(countName(4));
    expect(await readProtocolJson(page)).toEqual(before);
  });

  test('I will fix this, Dismiss and Restore set statuses, and the summary counts every choice', async ({
    architectPage: page,
    context,
    seed,
  }) => {
    const { popover } = await reviewedProtocol(page, seed, context);
    await popover
      .getByRole('button', { name: 'Go through 4 problems' })
      .click();

    let dialog = problemDialog(page, 'The first prompt is vague');
    await dialog.getByRole('button', { name: 'Fix for me' }).click();
    dialog = problemDialog(
      page,
      'The second prompt has no limit on how many to name',
    );
    await dialog.getByRole('button', { name: 'I will fix this' }).click();
    dialog = problemDialog(page, 'The closing stage repeats the welcome');
    await dialog.getByRole('button', { name: 'Dismiss' }).click();
    dialog = problemDialog(page, 'Nothing answers the research question');
    await dialog.getByRole('button', { name: 'I will fix this' }).click();

    const summary = problemDialog(page, 'You have been through every problem');
    await expect(summary).toBeVisible();
    await expect(summary.getByRole('listitem').nth(0)).toHaveText(
      '1 fixed for you',
    );
    await expect(summary.getByRole('listitem').nth(1)).toHaveText(
      '2 for you to fix',
    );
    await expect(summary.getByRole('listitem').nth(2)).toHaveText(
      '1 dismissed',
    );
    await expect(
      summary.getByRole('link', { name: 'Open stage 2' }),
    ).toBeVisible();
    await expect(
      summary.getByText(
        'The fix made for you can be undone from the Review protocol button.',
      ),
    ).toBeVisible();

    await summary.getByRole('button', { name: 'Done' }).click();
    // Everything is decided, so no count remains on the button.
    await expect(reviewButton(page)).toHaveAccessibleName('Review protocol');
    await reviewButton(page).click();
    await expect(popover.getByText('Fixed for you')).toHaveCount(1);
    await expect(popover.getByText('For you to fix')).toHaveCount(2);
    const dismissed = problemRow(
      popover,
      'The closing stage repeats the welcome',
    );
    await expect(dismissed.getByText('Dismissed')).toBeVisible();

    await dismissed.getByRole('button', { name: 'Restore' }).click();
    await expect(dismissed.getByText('Dismissed')).toHaveCount(0);
    await expect(reviewButton(page)).toHaveAccessibleName(countName(1));
  });

  test('the app’s own Undo after Fix for me returns the problem to undecided', async ({
    architectPage: page,
    context,
    seed,
  }) => {
    const { popover } = await reviewedProtocol(page, seed, context);
    const dialog = await openProblem(
      page,
      popover,
      'The first prompt is vague',
    );
    await dialog.getByRole('button', { name: 'Fix for me' }).click();
    await readProtocolJson(
      page,
      (protocol) => promptText(protocol, 'p1')?.en === NEW_P1_TEXT,
    );
    await closeProblemDialog(
      problemDialog(page, 'The second prompt has no limit on how many to name'),
    );
    await expect(reviewButton(page)).toHaveAccessibleName(countName(3));

    await page
      .getByRole('toolbar', { name: 'History actions' })
      .getByRole('button', { name: 'Undo' })
      .click();

    const undone = await readProtocolJson(
      page,
      (protocol) => promptText(protocol, 'p1')?.en === OLD_P1_TEXT,
    );
    expect(promptText(undone, 'p1')).toEqual({ en: OLD_P1_TEXT, fr: 'Nommez' });
    await expect(reviewButton(page)).toHaveAccessibleName(countName(4));
    await reviewButton(page).click();
    await expect(popover.getByText('Fixed for you')).toHaveCount(0);
  });
});

test.describe('when a review cannot run', () => {
  const retryAt = () => new Date(Date.now() + 45 * 60_000).toISOString();

  /** The time of day the app shows for `iso`, as the browser formats it. */
  const timeOf = (page: Page, iso: string) =>
    page.evaluate(
      (value) =>
        new Intl.DateTimeFormat('en', {
          hour: 'numeric',
          minute: '2-digit',
        }).format(new Date(value)),
      iso,
    );

  async function refused(
    page: Page,
    context: BrowserContext,
    seed: (protocol: CurrentProtocol) => Promise<string>,
    reply: Parameters<typeof mockReviewService>[1],
  ) {
    const service = await mockReviewService(context, reply);
    await seed(reviewProtocolWithDetails());
    await gotoProtocol(page);
    await reviewButton(page).click();
    const popover = popoverOf(page);
    await popover.getByRole('button', { name: 'Start review' }).click();
    return { service, popover };
  }

  test('429 hourly limit says when reviews come back', async ({
    architectPage: page,
    context,
    seed,
  }) => {
    const at = retryAt();
    const { popover } = await refused(page, context, seed, {
      kind: 'error',
      status: 429,
      error: 'hourly_limit',
      retryAt: at,
    });
    await expect(
      popover.getByText('You have used your 5 reviews for this hour'),
    ).toBeVisible();
    const time = await timeOf(page, at);
    await expect(
      popover.getByText(
        new RegExp(
          `You can review again (today|tomorrow) at ${time}\\. The limit keeps`,
        ),
      ),
    ).toBeVisible();
    await expect(popover.getByText('Try again')).toHaveCount(0);
  });

  test('503 daily limit says when the service starts again', async ({
    architectPage: page,
    context,
    seed,
  }) => {
    const at = retryAt();
    const { popover } = await refused(page, context, seed, {
      kind: 'error',
      status: 503,
      error: 'daily_limit',
      retryAt: at,
    });
    await expect(
      popover.getByText('Protocol review has reached its limit for today'),
    ).toBeVisible();
    const time = await timeOf(page, at);
    await expect(
      popover.getByText(
        new RegExp(
          `It starts again (today|tomorrow) at ${time}\\. Nothing in your protocol`,
        ),
      ),
    ).toBeVisible();
  });

  test('503 service unavailable offers Try again, which runs the review', async ({
    architectPage: page,
    context,
    seed,
  }) => {
    const { service, popover } = await refused(page, context, seed, {
      kind: 'error',
      status: 503,
      error: 'service_unavailable',
      retryAt: null,
    });
    await expect(
      popover.getByText('Protocol review is not available right now'),
    ).toBeVisible();
    await expect(
      popover.getByText(/this attempt did not count towards your limit/),
    ).toBeVisible();

    service.reply(RESULT_REVIEW);
    await popover.getByRole('button', { name: 'Try again' }).click();
    await expect(reviewButton(page)).toHaveAccessibleName(
      countName(FINDINGS.length),
    );
    await expect(
      popover.getByText('Protocol review is not available right now'),
    ).toHaveCount(0);
    expect(service.bodies).toHaveLength(2);
  });

  test('offline says so and sends nothing', async ({
    architectPage: page,
    context,
    seed,
  }) => {
    const service = await mockReviewService(context, RESULT_REVIEW);
    await seed(reviewProtocolWithDetails());
    await gotoProtocol(page);

    await context.setOffline(true);
    await reviewButton(page).click();
    const popover = popoverOf(page);
    await expect(popover.getByText('You’re offline')).toBeVisible();
    // This protocol has no review yet, so the notice must not point at one.
    await expect(
      popover.getByText(
        'Protocol review needs an internet connection. You can review this protocol when you are back online.',
      ),
    ).toBeVisible();
    const start = popover.getByRole('button', { name: 'Start review' });
    await expect(start).toBeDisabled();
    await start.click({ force: true });

    await context.setOffline(false);
    await expect(popover.getByText('You’re offline')).toHaveCount(0);
    await popover.getByRole('button', { name: 'Start review' }).click();
    await expect(reviewButton(page)).toHaveAccessibleName(
      countName(FINDINGS.length),
    );
    expect(service.bodies).toHaveLength(1);
  });
});

test.describe('persistence', () => {
  /** A finished review with the first problem fixed, its dialog closed. */
  async function reviewedWithOneFix(
    page: Page,
    context: BrowserContext,
    seed: (protocol: CurrentProtocol) => Promise<string>,
  ) {
    const { popover } = await reviewedProtocol(page, seed, context);
    const dialog = await openProblem(
      page,
      popover,
      'The first prompt is vague',
    );
    await dialog.getByRole('button', { name: 'Fix for me' }).click();
    await readProtocolJson(
      page,
      (protocol) => promptText(protocol, 'p1')?.en === NEW_P1_TEXT,
    );
    await closeProblemDialog(
      problemDialog(page, 'The second prompt has no limit on how many to name'),
    );
  }

  test('a review and the choices made on it survive a reload', async ({
    architectPage: page,
    context,
    seed,
  }) => {
    await reviewedWithOneFix(page, context, seed);

    await gotoProtocol(page);
    await expect(reviewButton(page)).toHaveAccessibleName(countName(3));
    await reviewButton(page).click();
    const afterReload = popoverOf(page);
    await expect(problemList(afterReload).getByRole('listitem')).toHaveCount(4);
    await expect(
      problemRow(afterReload, 'The first prompt is vague').getByText(
        'Fixed for you',
      ),
    ).toBeVisible();
  });

  test('the review is kept in the browser and is not in the downloaded protocol', async ({
    architectPage: page,
    context,
    seed,
  }) => {
    await reviewedWithOneFix(page, context, seed);

    const [download] = await Promise.all([
      page.waitForEvent('download'),
      new Toolbar(page).download(),
    ]);
    const path = await download.path();
    const zip = await JSZip.loadAsync(await readFile(path));
    const file = zip.file('protocol.json');
    if (!file) throw new Error('the download has no protocol.json');
    const text = await file.async('string');
    // The control: this is the protocol, with the fix in it.
    expect(text).toContain('"Advice study"');
    expect(text).toContain(NEW_P1_TEXT);
    // The review is kept in the browser and nowhere in the file.
    expect(text).not.toContain(REVIEW_ID);
    expect(text).not.toContain('The first prompt is vague');
    expect(text).not.toContain('Participants may not know how many people');
    expect(text).not.toContain('"findings"');
    expect(text).not.toContain('"inverse"');
  });
});
