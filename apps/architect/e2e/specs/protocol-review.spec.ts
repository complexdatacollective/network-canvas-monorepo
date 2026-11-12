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
  SAVED_POPULATION,
  SAVED_QUESTION,
  SAVED_SYNOPSIS,
} from '../fixtures/protocol-review.js';
import { readProtocolJson } from '../helpers/read-store.js';
import { Toolbar } from '../pageobjects/toolbar.js';

// The Automated Protocol Review experiment, end to end, against the production
// build. The review service is never reached: its origin (the one the built
// app's Content-Security-Policy allows) is answered by `mockReviewService`,
// whose findings address the seeded protocol's real stage and prompt ids, so
// "Fix for me" really edits the protocol and the saved row shows it.

const RESULT_REVIEW = { kind: 'result', findings: FINDINGS } as const;

type Seed = (protocol: CurrentProtocol) => Promise<string>;

const reviewButton = (page: Page) =>
  page.getByRole('button', { name: /^Review protocol|^Reviewing/ });

/** The review panel while it lists the problems (or has none to list). */
const popoverOf = (page: Page) =>
  page.getByRole('dialog', { name: 'Protocol review' });

const problemList = (popover: Locator) =>
  popover.getByRole('list', { name: 'Problems found' });

const problemRow = (popover: Locator, title: string) =>
  problemList(popover).getByRole('listitem').filter({ hasText: title });

const rowButton = (popover: Locator, title: string) =>
  problemRow(popover, title).getByRole('button', { name: new RegExp(title) });

/** The review panel while it shows one problem: named by the problem's title, exactly. */
const problemView = (page: Page, title: string) =>
  page.getByRole('dialog', { name: title, exact: true });

/** Fix for me, by its exact name. */
const fixForMe = (view: Locator) =>
  view.getByRole('button', { name: 'Fix for me', exact: true });

const countName = (count: number) =>
  `Review protocol, ${count} ${count === 1 ? 'problem' : 'problems'} still to decide`;

const mainNav = (page: Page) =>
  page.getByRole('navigation', { name: 'Main navigation' });

const reviewSwitch = (page: Page) =>
  page.getByRole('switch', { name: 'Automated Protocol Review' });

// The dialog every review is asked for through. Each step names the dialog.
const STEP = {
  before: 'Before you use this feature',
  synopsis: 'Describe your study',
  participants: 'Who takes part, and how?',
  questions: 'What are your research questions?',
  model: 'Choose a model',
} as const;

const wizardStep = (page: Page, name: string) =>
  page.getByRole('dialog', { name });

const shareCheckbox = (page: Page) =>
  wizardStep(page, STEP.before).getByRole('checkbox', {
    name: 'Share the results of this review with the Network Canvas team',
  });

const modelOption = (page: Page, model: 'Claude Opus 5.5' | 'GPT-6.1 Sol') =>
  wizardStep(page, STEP.model).getByRole('option', {
    name: new RegExp(`^${model.replaceAll('.', '\\.')}`),
  });

/** Presses Continue on a step and waits for the next one. */
async function continueFrom(page: Page, from: string, to: string) {
  await wizardStep(page, from)
    .getByRole('button', { name: 'Continue' })
    .click();
  await expect(wizardStep(page, to)).toBeVisible();
}

/** From the first step, through the details as they are, to the last. */
async function continueToModelStep(page: Page) {
  await continueFrom(page, STEP.before, STEP.synopsis);
  await continueFrom(page, STEP.synopsis, STEP.participants);
  await continueFrom(page, STEP.participants, STEP.questions);
  await continueFrom(page, STEP.questions, STEP.model);
}

async function pressStartReview(page: Page) {
  const last = wizardStep(page, STEP.model);
  await last.getByRole('button', { name: 'Start review' }).click();
  await expect(last).toBeHidden();
}

/**
 * Asks for a review of a protocol whose details are saved: the button opens
 * the dialog, which is completed as it is prefilled, and the review's results
 * arrive in the panel.
 */
async function startReview(page: Page) {
  await reviewButton(page).click();
  await expect(wizardStep(page, STEP.before)).toBeVisible();
  await continueToModelStep(page);
  await pressStartReview(page);
  await expect(reviewButton(page)).toHaveAccessibleName(
    countName(FINDINGS.length),
  );
  return popoverOf(page);
}

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

function onlyBody(service: Awaited<ReturnType<typeof mockReviewService>>) {
  expect(service.bodies).toHaveLength(1);
  const [body] = service.bodies;
  if (!body) throw new Error('no review request was recorded');
  return body;
}

/** Seeds a protocol with study details, opens it and gets a finished review. */
async function reviewedProtocol(
  page: Page,
  seed: Seed,
  context: BrowserContext,
) {
  const service = await mockReviewService(context, RESULT_REVIEW);
  await seed(reviewProtocolWithDetails());
  await gotoProtocol(page);
  const popover = await startReview(page);
  return { service, popover };
}

async function openProblem(page: Page, popover: Locator, title: string) {
  await rowButton(popover, title).click();
  const view = problemView(page, title);
  await expect(view).toBeVisible();
  return view;
}

type Box = { x: number; y: number; width: number; height: number };

/**
 * The box of `locator` once it has stopped moving: the same on two reads in
 * a row, with the element fully opaque (a panel arrives with a fade and rise).
 */
async function settledBox(locator: Locator): Promise<Box> {
  let previous = '';
  let box: Box | null = null;
  await expect
    .poll(async () => {
      box = await locator.boundingBox();
      const opacity = await locator.evaluate(
        (element) => getComputedStyle(element).opacity,
      );
      const key = JSON.stringify(box);
      const settled = box !== null && key === previous && opacity === '1';
      previous = key;
      return settled;
    })
    .toBe(true);
  if (!box) throw new Error('the element has no box');
  return box;
}

/** Back from one problem to the list, whose row for it takes focus. */
async function backToList(page: Page, view: Locator, title: string) {
  await view.getByRole('button', { name: 'Back' }).click();
  const popover = popoverOf(page);
  await expect(problemList(popover)).toBeVisible();
  await expect(rowButton(popover, title)).toBeFocused();
  return popover;
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
        synopsis: SAVED_SYNOPSIS,
        researchQuestions: [SAVED_QUESTION],
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
    expect(JSON.stringify(removed)).not.toContain(SAVED_POPULATION);
    expect(JSON.stringify(removed)).not.toContain(SAVED_SYNOPSIS);
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

test.describe('asking for a review', () => {
  test('the dialog validates each step, takes any number of questions, then saves the details and sends one request', async ({
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
    // The dialog opened, not the panel: there is no review to show.
    const before = wizardStep(page, STEP.before);
    await expect(before).toBeVisible();
    await expect(popoverOf(page)).toHaveCount(0);
    const sentTable = before.getByRole('table', {
      name: 'What is sent for review, and what is never sent',
    });
    await expect(
      sentTable.getByRole('columnheader', { name: 'What is sent' }),
    ).toBeVisible();
    await expect(
      sentTable.getByRole('columnheader', { name: 'What is never sent' }),
    ).toBeVisible();
    await expect(
      sentTable.getByRole('cell', { name: 'API keys saved in your protocol' }),
    ).toBeVisible();
    await continueFrom(page, STEP.before, STEP.synopsis);

    // The synopsis is required.
    const synopsis = wizardStep(page, STEP.synopsis);
    await synopsis.getByRole('button', { name: 'Continue' }).click();
    await expect(synopsis.getByText('Describe your study.')).toBeVisible();
    await expect(
      synopsis.getByRole('textbox', { name: 'Study synopsis' }),
    ).toBeFocused();
    await synopsis
      .getByRole('textbox', { name: 'Study synopsis' })
      .fill('A survey of advice networks.');
    await continueFrom(page, STEP.synopsis, STEP.participants);

    // So are both of the participants step's answers, and it says which.
    const participants = wizardStep(page, STEP.participants);
    await participants.getByRole('button', { name: 'Continue' }).click();
    await expect(
      participants.getByText('Describe who will be interviewed.'),
    ).toBeVisible();
    await expect(
      participants.getByText('Choose how the interview is administered.'),
    ).toBeVisible();
    await expect(participants).toBeVisible();
    await participants
      .getByRole('textbox', { name: 'Research population' })
      .fill(SAVED_POPULATION);
    await participants.getByRole('option', { name: /^Face to face/ }).click();
    await continueFrom(page, STEP.participants, STEP.questions);

    // No limit: three more questions are added. Each new box takes focus and
    // is wholly on screen, although by the fourth the step is taller than the
    // dialog and scrolls.
    const questionsStep = wizardStep(page, STEP.questions);
    for (const number of [2, 3, 4]) {
      await questionsStep
        .getByRole('button', { name: 'Add a research question' })
        .click();
      const added = questionsStep.getByRole('textbox', {
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
      await questionsStep
        .getByRole('textbox', { name: `Research question ${index + 1}` })
        .fill(question);
    }
    await expect(
      questionsStep.getByRole('textbox', { name: /^Research question \d+$/ }),
    ).toHaveCount(4);
    await continueFrom(page, STEP.questions, STEP.model);

    // The last step says how many reviews are left; nothing is sent yet.
    const model = wizardStep(page, STEP.model);
    await expect(
      model.getByText('5 of 5 reviews left this hour'),
    ).toBeVisible();
    expect(service.bodies).toHaveLength(0);
    await pressStartReview(page);

    await expect(reviewButton(page)).toHaveAccessibleName(
      countName(FINDINGS.length),
    );
    const body = onlyBody(service);
    expect(body.installationId).toMatch(
      /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i,
    );
    // Sharing was left as it starts: on.
    expect(body.share).toBe(true);
    expect(body.provider).toBe('anthropic');
    expect(body.locale).toBe('en');
    expect(body.studyContext).toEqual({
      synopsis: 'A survey of advice networks.',
      population: SAVED_POPULATION,
      administration: 'face_to_face',
      researchQuestions: questions,
    });
    // The protocol goes without its experiments (the study details travel
    // separately), and is otherwise the protocol the researcher is editing.
    expect(Object.keys(body.protocol)).not.toContain('experiments');
    expect(JSON.stringify(body.protocol)).not.toContain(SAVED_POPULATION);
    expect(body.protocol.name).toBe('Advice study');
    expect(body.protocol.stages).toEqual(reviewProtocol().stages);

    const saved = await readProtocolJson(page, (protocol) =>
      JSON.stringify(protocol.experiments?.protocolReview).includes(
        '"studyContext"',
      ),
    );
    expect(saved.experiments?.protocolReview).toMatchObject({
      studyContext: {
        synopsis: 'A survey of advice networks.',
        researchQuestions: questions,
        population: SAVED_POPULATION,
        administration: 'face_to_face',
      },
    });

    // The results are on screen.
    await expect(
      problemList(popoverOf(page)).getByRole('listitem'),
    ).toHaveCount(FINDINGS.length);
  });

  test('the dialog opens every time with the saved details filled in, and cancelling sends nothing', async ({
    architectPage: page,
    context,
    seed,
  }) => {
    const service = await mockReviewService(context, RESULT_REVIEW);
    await seed(reviewProtocolWithDetails());
    await gotoProtocol(page);

    for (const attempt of [1, 2]) {
      await reviewButton(page).click();
      await expect(wizardStep(page, STEP.before)).toBeVisible();
      await continueFrom(page, STEP.before, STEP.synopsis);
      await expect(
        wizardStep(page, STEP.synopsis).getByRole('textbox', {
          name: 'Study synopsis',
        }),
      ).toHaveValue(SAVED_SYNOPSIS);
      await continueFrom(page, STEP.synopsis, STEP.participants);
      const participants = wizardStep(page, STEP.participants);
      await expect(
        participants.getByRole('textbox', { name: 'Research population' }),
      ).toHaveValue(SAVED_POPULATION);
      await expect(
        participants.getByRole('option', { name: /^Face to face/ }),
      ).toHaveAttribute('aria-selected', 'true');
      await expect(
        participants.getByRole('option', { name: /^Self-administered/ }),
      ).toHaveAttribute('aria-selected', 'false');
      await continueFrom(page, STEP.participants, STEP.questions);
      const questions = wizardStep(page, STEP.questions);
      await expect(
        questions.getByRole('textbox', { name: 'Research question 1' }),
      ).toHaveValue(SAVED_QUESTION);

      // Cancel closes it, returns focus to the button, and opens no panel.
      await questions.getByRole('button', { name: 'Cancel' }).click();
      await expect(questions).toBeHidden();
      await expect(reviewButton(page)).toBeFocused();
      await expect(popoverOf(page)).toHaveCount(0);
      expect(service.bodies, `after cancel ${attempt}`).toHaveLength(0);
    }

    // A change made in the dialog is sent, and saved into the protocol.
    await reviewButton(page).click();
    await continueFrom(page, STEP.before, STEP.synopsis);
    await continueFrom(page, STEP.synopsis, STEP.participants);
    await wizardStep(page, STEP.participants)
      .getByRole('textbox', { name: 'Research population' })
      .fill('Adults over 70 living alone');
    await continueFrom(page, STEP.participants, STEP.questions);
    await continueFrom(page, STEP.questions, STEP.model);
    await pressStartReview(page);
    await expect(reviewButton(page)).toHaveAccessibleName(
      countName(FINDINGS.length),
    );
    expect(onlyBody(service).studyContext.population).toBe(
      'Adults over 70 living alone',
    );
    const saved = await readProtocolJson(page, (protocol) =>
      JSON.stringify(protocol.experiments?.protocolReview).includes(
        'Adults over 70',
      ),
    );
    expect(saved.experiments?.protocolReview).toMatchObject({
      studyContext: {
        synopsis: SAVED_SYNOPSIS,
        population: 'Adults over 70 living alone',
        researchQuestions: [SAVED_QUESTION],
      },
    });
  });

  test('research questions are optional: an empty box is not sent', async ({
    architectPage: page,
    context,
    seed,
  }) => {
    const service = await mockReviewService(context, RESULT_REVIEW);
    await seed(reviewProtocolWithDetails());
    await gotoProtocol(page);

    await reviewButton(page).click();
    await continueFrom(page, STEP.before, STEP.synopsis);
    await continueFrom(page, STEP.synopsis, STEP.participants);
    await continueFrom(page, STEP.participants, STEP.questions);
    const questions = wizardStep(page, STEP.questions);
    const first = questions.getByRole('textbox', {
      name: 'Research question 1',
    });
    await expect(first).toHaveValue(SAVED_QUESTION);
    await first.fill('');
    // An empty box does not stop the step.
    await continueFrom(page, STEP.questions, STEP.model);
    await pressStartReview(page);

    await expect(reviewButton(page)).toHaveAccessibleName(
      countName(FINDINGS.length),
    );
    expect(onlyBody(service).studyContext).toEqual({
      synopsis: SAVED_SYNOPSIS,
      population: SAVED_POPULATION,
      administration: 'face_to_face',
      researchQuestions: [],
    });
    const saved = await readProtocolJson(
      page,
      (protocol) =>
        !JSON.stringify(protocol.experiments?.protocolReview).includes(
          SAVED_QUESTION,
        ),
    );
    expect(saved.experiments?.protocolReview).toMatchObject({
      studyContext: { synopsis: SAVED_SYNOPSIS, researchQuestions: [] },
    });
  });

  test('the model chosen in the last step writes the review, and is chosen again next time', async ({
    architectPage: page,
    context,
    seed,
  }) => {
    const service = await mockReviewService(context, RESULT_REVIEW);
    await seed(reviewProtocolWithDetails());
    await gotoProtocol(page);

    await reviewButton(page).click();
    await continueToModelStep(page);
    const claude = modelOption(page, 'Claude Opus 5.5');
    const gpt = modelOption(page, 'GPT-6.1 Sol');
    await expect(claude).toHaveAttribute('aria-selected', 'true');
    await expect(gpt).toHaveAttribute('aria-selected', 'false');
    await gpt.click();
    await expect(gpt).toHaveAttribute('aria-selected', 'true');
    await expect(claude).toHaveAttribute('aria-selected', 'false');
    await pressStartReview(page);
    await expect(reviewButton(page)).toHaveAccessibleName(
      countName(FINDINGS.length),
    );
    expect(onlyBody(service).provider).toBe('openai');

    // After a reload and a dismissed review, the dialog chooses it again.
    await popoverOf(page)
      .getByRole('button', { name: 'Dismiss review' })
      .click();
    await expect(popoverOf(page)).toBeHidden();
    await gotoProtocol(page);
    await reviewButton(page).click();
    await continueToModelStep(page);
    await expect(modelOption(page, 'GPT-6.1 Sol')).toHaveAttribute(
      'aria-selected',
      'true',
    );
    await expect(modelOption(page, 'Claude Opus 5.5')).toHaveAttribute(
      'aria-selected',
      'false',
    );
  });

  test('sharing is on until unticked, and an unticked choice is remembered for the protocol', async ({
    architectPage: page,
    context,
    seed,
  }) => {
    const service = await mockReviewService(context, RESULT_REVIEW);
    await seed(reviewProtocolWithDetails());
    await gotoProtocol(page);

    await reviewButton(page).click();
    await expect(shareCheckbox(page)).toBeChecked();
    await shareCheckbox(page).click();
    await expect(shareCheckbox(page)).not.toBeChecked();
    await continueToModelStep(page);
    await pressStartReview(page);
    await expect(reviewButton(page)).toHaveAccessibleName(
      countName(FINDINGS.length),
    );
    expect(onlyBody(service).share).toBe(false);

    // The next request for this protocol, after a reload, starts unticked.
    await popoverOf(page)
      .getByRole('button', { name: 'Dismiss review' })
      .click();
    await expect(popoverOf(page)).toBeHidden();
    await gotoProtocol(page);
    await reviewButton(page).click();
    await expect(shareCheckbox(page)).not.toBeChecked();
    await continueToModelStep(page);
    await pressStartReview(page);
    await expect(reviewButton(page)).toHaveAccessibleName(
      countName(FINDINGS.length),
    );
    expect(service.bodies.map((body) => body.share)).toEqual([false, false]);
  });
});

test.describe('results', () => {
  test('the button counts what is still to decide; the panel lists problems most serious first', async ({
    architectPage: page,
    context,
    seed,
  }) => {
    const { popover } = await reviewedProtocol(page, seed, context);

    await expect(
      popover.getByText(
        'The results of your review are shown below in order of importance.',
      ),
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
      popover.getByRole('button', { name: 'Dismiss review' }),
    ).toBeVisible();
    await expect(
      popover.getByRole('button', { name: 'Go through 4 problems' }),
    ).toBeVisible();
    // A new review is only asked for once this one is dismissed.
    await expect(
      popover.getByRole('button', { name: /Review again|Start review/ }),
    ).toHaveCount(0);
  });

  test('a problem opens inside the panel, and Back returns to the list at its row', async ({
    architectPage: page,
    context,
    seed,
  }) => {
    const { popover } = await reviewedProtocol(page, seed, context);
    const title = 'The second prompt has no limit on how many to name';
    const listBox = await settledBox(popover);
    const buttonBox = await settledBox(reviewButton(page));

    const view = await openProblem(page, popover, title);
    // The taller problem view stays where the list was: the same left edge,
    // still above the button and on screen, not moved to another side of it.
    const viewBox = await settledBox(view);
    expect(Math.round(viewBox.x)).toBe(Math.round(listBox.x));
    expect(viewBox.y).toBeGreaterThanOrEqual(0);
    expect(viewBox.y + viewBox.height).toBeLessThanOrEqual(buttonBox.y);
    // The panel shows the problem in the list's place: no second dialog.
    await expect(page.getByRole('dialog')).toHaveCount(1);
    await expect(problemList(page.getByRole('dialog'))).toHaveCount(0);
    await expect(view.getByRole('heading', { name: title })).toBeFocused();
    await expect(view.getByText('Worth fixing', { exact: true })).toBeVisible();
    await expect(
      view.getByText('Open-ended naming is tiring and makes interviews long.'),
    ).toBeVisible();
    await expect(
      view.getByRole('heading', { name: 'Suggested fix' }),
    ).toBeVisible();
    await expect(view.getByText('Problem 2 of 4')).toBeVisible();

    await backToList(page, view, title);
    await expect(problemView(page, title)).toHaveCount(0);
  });

  test('Fix for me rewrites the prompt, Next problem moves on, the row is marked Fixed for you, and the row’s Undo restores the old text', async ({
    architectPage: page,
    context,
    seed,
  }) => {
    const { popover } = await reviewedProtocol(page, seed, context);
    const title = 'The first prompt is vague';
    const next = 'The second prompt has no limit on how many to name';

    const view = await openProblem(page, popover, title);
    await expect(view.getByText('Problem 1 of 4')).toBeVisible();
    await expect(view.getByText('Now', { exact: true })).toBeVisible();
    await expect(view.getByText(OLD_P1_TEXT, { exact: true })).toBeVisible();
    await expect(
      view.getByText('After the fix', { exact: true }),
    ).toBeVisible();
    await expect(view.getByText(NEW_P1_TEXT, { exact: true })).toBeVisible();
    await expect(
      view.getByText(
        'This protocol also has this text in French. Fix for me does not change that version, so check it after the fix.',
      ),
    ).toBeVisible();

    await fixForMe(view).click();
    await view.getByRole('button', { name: 'Next problem' }).click();
    // On to the next problem, in the same panel.
    const nextView = problemView(page, next);
    await expect(nextView).toBeVisible();
    await expect(nextView.getByText('Problem 2 of 4')).toBeVisible();

    const fixed = await readProtocolJson(
      page,
      (protocol) => promptText(protocol, 'p1')?.en === NEW_P1_TEXT,
    );
    // Only the default language's entry changes.
    expect(promptText(fixed, 'p1')).toEqual({ en: NEW_P1_TEXT, fr: 'Nommez' });
    await expect(reviewButton(page)).toHaveAccessibleName(countName(3));

    await backToList(page, nextView, next);
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

  test('a fixed problem offers Undo and Next problem in the panel', async ({
    architectPage: page,
    context,
    seed,
  }) => {
    const { popover } = await reviewedProtocol(page, seed, context);
    const title = 'The first prompt is vague';
    const first = await openProblem(page, popover, title);
    await fixForMe(first).click();
    await first.getByRole('button', { name: 'Next problem' }).click();
    const second = problemView(
      page,
      'The second prompt has no limit on how many to name',
    );
    await expect(second).toBeVisible();
    await backToList(
      page,
      second,
      'The second prompt has no limit on how many to name',
    );

    const view = await openProblem(page, popover, title);
    await expect(
      view.getByText(
        'This was fixed for you. Undo takes the change back out of your protocol.',
      ),
    ).toBeVisible();
    await expect(fixForMe(view)).toHaveCount(0);
    await view.getByRole('button', { name: 'Undo' }).click();
    await readProtocolJson(
      page,
      (protocol) => promptText(protocol, 'p1')?.en === OLD_P1_TEXT,
    );
    // Undone, it is undecided again and stays on screen to decide.
    await expect(fixForMe(view)).toBeVisible();
    await expect(reviewButton(page)).toHaveAccessibleName(countName(4));

    await fixForMe(view).click();
    await view.getByRole('button', { name: 'Next problem' }).click();
    await expect(second).toBeVisible();
    await backToList(
      page,
      second,
      'The second prompt has no limit on how many to name',
    );
    const again = await openProblem(page, popover, title);
    await again.getByRole('button', { name: 'Next problem' }).click();
    await expect(second).toBeVisible();
  });

  test('a structurally valid fix changes the prompt and the stage setting, and Undo takes both back out', async ({
    architectPage: page,
    context,
    seed,
  }) => {
    const { popover } = await reviewedProtocol(page, seed, context);
    const title = 'The second prompt has no limit on how many to name';

    const view = await openProblem(page, popover, title);
    await expect(
      view.getByText('Stage 2 · Names: require at least two names'),
    ).toBeVisible();
    await fixForMe(view).click();

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

    await view.getByRole('button', { name: 'Next problem' }).click();
    const nextTitle = 'The closing stage repeats the welcome';
    await backToList(page, problemView(page, nextTitle), nextTitle);
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
    const title = 'The closing stage repeats the welcome';

    const view = await openProblem(page, popover, title);
    await expect(
      view.getByText(
        'This fix cannot be made for you. Make the change yourself, using the description below.',
      ),
    ).toBeVisible();
    const fix = fixForMe(view);
    await expect(fix).toBeDisabled();
    // I will fix this is still on offer.
    await expect(
      view.getByRole('button', { name: 'I will fix this' }),
    ).toBeEnabled();
    // Forcing the click through the disabled state changes nothing: the
    // problem stays on screen, undecided.
    await fix.click({ force: true });
    await expect(view.getByText('Problem 3 of 4')).toBeVisible();
    await backToList(page, view, title);
    await expect(reviewButton(page)).toHaveAccessibleName(countName(4));
    expect(await readProtocolJson(page)).toEqual(before);
  });

  test('going through every problem sets each status, and the last decision returns to the list', async ({
    architectPage: page,
    context,
    seed,
  }) => {
    const { popover } = await reviewedProtocol(page, seed, context);
    await popover
      .getByRole('button', { name: 'Go through 4 problems' })
      .click();

    const decide = async (title: string, button: string, position: number) => {
      const view = problemView(page, title);
      await expect(view.getByText(`Problem ${position} of 4`)).toBeVisible();
      await view.getByRole('button', { name: button }).click();
    };
    await decide('The first prompt is vague', 'Fix for me', 1);
    await problemView(page, 'The first prompt is vague')
      .getByRole('button', { name: 'Next problem' })
      .click();
    await decide(
      'The second prompt has no limit on how many to name',
      'I will fix this',
      2,
    );
    await decide('The closing stage repeats the welcome', 'Dismiss', 3);
    await decide('Nothing answers the research question', 'I will fix this', 4);

    // Back at the list, with no summary in between.
    await expect(problemList(popover)).toBeVisible();
    await expect(
      page.getByText('You have been through every problem'),
    ).toHaveCount(0);
    // Everything is decided, so no count remains on the button, and there is
    // nothing left to go through.
    await expect(reviewButton(page)).toHaveAccessibleName('Review protocol');
    await expect(
      popover.getByRole('button', { name: /^Go through/ }),
    ).toHaveCount(0);
    await expect(popover.getByText('Fixed for you')).toHaveCount(1);
    await expect(popover.getByText('For you to fix')).toHaveCount(2);
    await expect(
      problemRow(
        popover,
        'The second prompt has no limit on how many to name',
      ).getByRole('link', { name: 'Open stage 2' }),
    ).toBeVisible();
    const dismissed = problemRow(
      popover,
      'The closing stage repeats the welcome',
    );
    await expect(dismissed.getByText('Dismissed')).toBeVisible();

    await dismissed.getByRole('button', { name: 'Undo dismiss' }).click();
    await expect(dismissed.getByText('Dismissed')).toHaveCount(0);
    await expect(reviewButton(page)).toHaveAccessibleName(countName(1));
    await expect(
      popover.getByRole('button', { name: 'Go through 1 problem' }),
    ).toBeVisible();

    // A problem taken on is restored from its own view.
    const mine = await openProblem(
      page,
      popover,
      'Nothing answers the research question',
    );
    await expect(
      mine.getByText('You chose to fix this yourself.'),
    ).toBeVisible();
    await mine.getByRole('button', { name: 'Decide later' }).click();
    await expect(reviewButton(page)).toHaveAccessibleName(countName(2));
    await expect(mine.getByText('You chose to fix this yourself.')).toHaveCount(
      0,
    );
  });

  test('the app’s own Undo after Fix for me returns the problem to undecided', async ({
    architectPage: page,
    context,
    seed,
  }) => {
    const { popover } = await reviewedProtocol(page, seed, context);
    const view = await openProblem(page, popover, 'The first prompt is vague');
    await fixForMe(view).click();
    await readProtocolJson(
      page,
      (protocol) => promptText(protocol, 'p1')?.en === NEW_P1_TEXT,
    );
    await view.getByRole('button', { name: 'Next problem' }).click();
    const next = problemView(
      page,
      'The second prompt has no limit on how many to name',
    );
    await next.getByRole('button', { name: 'Close' }).click();
    await expect(next).toBeHidden();
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
    await expect(problemList(popover)).toBeVisible();
    await expect(popover.getByText('Fixed for you')).toHaveCount(0);
  });

  test('Dismiss review removes the review, keeps its fixes, and the button asks for a new one', async ({
    architectPage: page,
    context,
    seed,
  }) => {
    const { service, popover } = await reviewedProtocol(page, seed, context);
    const view = await openProblem(page, popover, 'The first prompt is vague');
    await fixForMe(view).click();
    await view.getByRole('button', { name: 'Next problem' }).click();
    const second = 'The second prompt has no limit on how many to name';
    await backToList(page, problemView(page, second), second);

    await popover.getByRole('button', { name: 'Dismiss review' }).click();
    await expect(popover).toBeHidden();
    await expect(reviewButton(page)).toHaveAccessibleName('Review protocol');
    // The fix is the protocol's now; only the review went.
    const kept = await readProtocolJson(page);
    expect(promptText(kept, 'p1')).toEqual({ en: NEW_P1_TEXT, fr: 'Nommez' });

    // Back to the start, after a reload too: the button opens the dialog.
    await gotoProtocol(page);
    await expect(reviewButton(page)).toHaveAccessibleName('Review protocol');
    await reviewButton(page).click();
    await expect(wizardStep(page, STEP.before)).toBeVisible();
    await expect(popoverOf(page)).toHaveCount(0);

    // And the same protocol can be reviewed again.
    await continueToModelStep(page);
    await pressStartReview(page);
    // The stand-in service answers with the same problems, the first among
    // them. The protocol already holds the change that problem asks for, so
    // it shows as fixed and is not left to decide; the fix was the earlier
    // review's, so this review offers no Undo for it.
    await expect(reviewButton(page)).toHaveAccessibleName(
      countName(FINDINGS.length - 1),
    );
    expect(service.bodies).toHaveLength(2);
    const first = problemRow(popover, 'The first prompt is vague');
    await expect(first).toBeVisible();
    await expect(first.getByText('Fixed for you')).toBeVisible();
    await expect(first.getByRole('button', { name: 'Undo' })).toHaveCount(0);
    await expect(popover.getByText('Fixed for you')).toHaveCount(1);
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

  /** Asks for a review the service refuses; the panel opens on the refusal. */
  async function refused(
    page: Page,
    context: BrowserContext,
    seed: Seed,
    reply: Parameters<typeof mockReviewService>[1],
  ) {
    const service = await mockReviewService(context, reply);
    await seed(reviewProtocolWithDetails());
    await gotoProtocol(page);
    await reviewButton(page).click();
    await continueToModelStep(page);
    await pressStartReview(page);
    const popover = popoverOf(page);
    await expect(popover).toBeVisible();
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
    await expect(popover.getByText('Not reviewed yet')).toBeVisible();
    await expect(popover.getByText('Try again')).toHaveCount(0);
  });

  for (const error of ['daily_limit', 'monthly_limit'] as const) {
    test(`503 ${error} greys out that model, and the other writes the review`, async ({
      architectPage: page,
      context,
      seed,
    }) => {
      const at = retryAt();
      const { service, popover } = await refused(page, context, seed, {
        kind: 'error',
        status: 503,
        error,
        retryAt: at,
      });
      await expect(
        popover.getByText('The budget for Anthropic has been spent', {
          exact: true,
        }),
      ).toBeVisible();
      await expect(
        popover.getByText(
          /Start the review again to choose another model\. Nothing in your protocol was changed\.$/,
        ),
      ).toBeVisible();
      expect(service.bodies.map((body) => body.provider)).toEqual([
        'anthropic',
      ]);

      // Start review asks again through the dialog, whose last step greys
      // out the spent model and says why.
      service.reply(RESULT_REVIEW);
      await popover.getByRole('button', { name: 'Start review' }).click();
      await expect(wizardStep(page, STEP.before)).toBeVisible();
      await continueToModelStep(page);
      const time = await timeOf(page, at);
      const claude = modelOption(page, 'Claude Opus 5.5');
      await expect(claude).toBeDisabled();
      await expect(claude).toHaveAccessibleName(
        new RegExp(
          `The budget for Anthropic has been spent\\. It starts again (today|tomorrow) at ${time}\\.`,
        ),
      );
      const gpt = modelOption(page, 'GPT-6.1 Sol');
      await expect(gpt).toBeEnabled();
      await expect(gpt).toHaveAttribute('aria-selected', 'true');

      await pressStartReview(page);
      await expect(reviewButton(page)).toHaveAccessibleName(
        countName(FINDINGS.length),
      );
      expect(service.bodies.map((body) => body.provider)).toEqual([
        'anthropic',
        'openai',
      ]);
      await expect(problemList(popover)).toBeVisible();
      await expect(
        popover.getByText('The budget for Anthropic has been spent', {
          exact: true,
        }),
      ).toHaveCount(0);
    });
  }

  test('every provider’s budget spent: the first press opens the panel, which holds reviews until the first budget starts again', async ({
    architectPage: page,
    context,
    seed,
  }) => {
    const soon = retryAt();
    const later = new Date(Date.now() + 20 * 24 * 3_600_000).toISOString();
    const service = await mockReviewService(context, RESULT_REVIEW, [
      {
        provider: 'anthropic',
        available: false,
        reason: 'monthly_limit',
        retryAt: later,
      },
      {
        provider: 'openai',
        available: false,
        reason: 'daily_limit',
        retryAt: soon,
      },
    ]);
    await seed(reviewProtocolWithDetails());
    // The Stages screen asks which providers have budget as soon as the
    // button is there, before anything is pressed.
    const answered = page.waitForResponse(
      (response) =>
        new URL(response.url()).pathname === '/providers' &&
        response.request().method() === 'GET',
    );
    await gotoProtocol(page);
    await expect(reviewButton(page)).toBeVisible();
    await answered;
    expect(service.providerRequests()).toBeGreaterThan(0);

    // So the first press opens the panel, which says why and when, and not
    // the dialog.
    await reviewButton(page).click();
    const popover = popoverOf(page);
    await expect(
      popover.getByText('Protocol review has reached its limit'),
    ).toBeVisible();
    await expect(
      popover.getByText(/Every provider’s budget has been spent\.$/),
    ).toBeVisible();
    const start = popover.getByRole('button', { name: 'Start review' });
    await expect(start).toHaveAttribute('aria-disabled', 'true');
    const time = await timeOf(page, soon);
    await expect(start).toHaveAccessibleDescription(
      new RegExp(`^Available again (today|tomorrow) at ${time}`),
    );
    await start.click({ force: true });
    // The panel stays; no dialog opened over it.
    await expect(
      popover.getByText('Protocol review has reached its limit'),
    ).toBeVisible();
    await expect(wizardStep(page, STEP.before)).toHaveCount(0);
    expect(service.bodies).toHaveLength(0);
  });

  test('budgets spent while the dialog is open: the last step says so and Start review cannot be pressed', async ({
    architectPage: page,
    context,
    seed,
  }) => {
    const service = await mockReviewService(context, RESULT_REVIEW);
    await seed(reviewProtocolWithDetails());
    await gotoProtocol(page);
    await reviewButton(page).click();
    await expect(wizardStep(page, STEP.before)).toBeVisible();
    // The last step asks again as it opens.
    service.providers([
      {
        provider: 'anthropic',
        available: false,
        reason: 'monthly_limit',
        retryAt: null,
      },
      {
        provider: 'openai',
        available: false,
        reason: 'daily_limit',
        retryAt: null,
      },
    ]);
    await continueToModelStep(page);
    const model = wizardStep(page, STEP.model);
    await expect(
      model.getByText(
        /Every provider’s budget has been spent, so a review cannot start for now\./,
      ),
    ).toBeVisible();
    await expect(modelOption(page, 'Claude Opus 5.5')).toBeDisabled();
    await expect(modelOption(page, 'GPT-6.1 Sol')).toBeDisabled();
    await expect(
      model.getByRole('button', { name: 'Start review' }),
    ).toBeDisabled();
    expect(service.bodies).toHaveLength(0);
  });

  test('503 service unavailable offers Try again, which sends the review again without the dialog', async ({
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
    await expect(wizardStep(page, STEP.before)).toHaveCount(0);
    await expect(
      popover.getByText('Protocol review is not available right now'),
    ).toHaveCount(0);
    expect(service.bodies).toHaveLength(2);
    expect(service.bodies[1]).toEqual(service.bodies[0]);
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
    // Offline, the button opens the panel rather than the dialog.
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
    await expect(start).toHaveAttribute('aria-disabled', 'true');
    await start.click({ force: true });
    await expect(popover.getByText('You’re offline')).toBeVisible();
    await expect(wizardStep(page, STEP.before)).toHaveCount(0);

    await context.setOffline(false);
    await expect(popover.getByText('You’re offline')).toHaveCount(0);
    await popover.getByRole('button', { name: 'Start review' }).click();
    await continueToModelStep(page);
    await pressStartReview(page);
    await expect(reviewButton(page)).toHaveAccessibleName(
      countName(FINDINGS.length),
    );
    expect(service.bodies).toHaveLength(1);
  });
});

test.describe('persistence', () => {
  /** A finished review with the first problem fixed, the panel back at the list. */
  async function reviewedWithOneFix(
    page: Page,
    context: BrowserContext,
    seed: Seed,
  ) {
    const { popover } = await reviewedProtocol(page, seed, context);
    const view = await openProblem(page, popover, 'The first prompt is vague');
    await fixForMe(view).click();
    await readProtocolJson(
      page,
      (protocol) => promptText(protocol, 'p1')?.en === NEW_P1_TEXT,
    );
    await view.getByRole('button', { name: 'Next problem' }).click();
    const next = 'The second prompt has no limit on how many to name';
    await backToList(page, problemView(page, next), next);
    await expect(reviewButton(page)).toHaveAccessibleName(countName(3));
  }

  test('a review and the choices made on it survive a reload', async ({
    architectPage: page,
    context,
    seed,
  }) => {
    await reviewedWithOneFix(page, context, seed);

    await gotoProtocol(page);
    await expect(reviewButton(page)).toHaveAccessibleName(countName(3));
    // With a review, the button opens the panel, not the dialog.
    await reviewButton(page).click();
    const afterReload = popoverOf(page);
    await expect(problemList(afterReload).getByRole('listitem')).toHaveCount(4);
    await expect(
      problemRow(afterReload, 'The first prompt is vague').getByText(
        'Fixed for you',
      ),
    ).toBeVisible();
    await expect(wizardStep(page, STEP.before)).toHaveCount(0);
  });

  test('the review is kept in the browser and is not in the downloaded protocol', async ({
    architectPage: page,
    context,
    seed,
  }) => {
    await reviewedWithOneFix(page, context, seed);
    await popoverOf(page).getByRole('button', { name: 'Close' }).click();
    await expect(popoverOf(page)).toBeHidden();

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
