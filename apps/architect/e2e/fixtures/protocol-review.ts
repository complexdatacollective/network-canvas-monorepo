import type { BrowserContext, Route } from '@playwright/test';

import { withInterfaceText } from '@codaco/interview/supplied-wording';
import {
  asEntityAttributeReference,
  type CurrentProtocol,
} from '@codaco/protocol-validation';

// The fixtures of the Automated Protocol Review specs: a small protocol whose
// real stage and prompt ids the mocked findings address, and a stand-in for
// the review service. The wire shapes are written out by hand rather than
// imported from `@codaco/protocol-review-worker/contract`: that module is the
// service's own, and a mock that borrowed its types could not notice a change
// to the wire format.

/** The only origin the built app's Content-Security-Policy lets it call. */
const REVIEW_SERVICE_ORIGIN = 'https://protocol-review.networkcanvas.com';

/** Fixed so the mocked result is the same on every run. */
export const REVIEW_ID = '0b8f4c1e-9d0a-4a3e-8f8f-1f2e3d4c5b6a';

/**
 * A valid schema 9 protocol in two languages: an Information stage, a
 * quick-add name generator with two prompts, and a closing stage. The
 * experiment is off until the spec turns it on.
 */
export const reviewProtocol = (): CurrentProtocol =>
  withInterfaceText<CurrentProtocol>({
    name: 'Advice study',
    schemaVersion: 9,
    localization: { defaultLocale: 'en', locales: ['en', 'fr'] },
    assetManifest: {},
    codebook: {
      node: {
        person: {
          name: 'Person',
          color: 'node-color-seq-1',
          shape: { default: 'circle' },
          variables: {
            name_var: { name: 'name', type: 'text' },
          },
        },
      },
      edge: {},
      ego: {},
    },
    stages: [
      {
        id: 'welcome',
        type: 'Information',
        label: { en: 'Welcome', fr: 'Bienvenue' },
        title: { en: 'Hello', fr: 'Bonjour' },
        items: [
          { id: 'intro', type: 'text', content: { en: 'Hi', fr: 'Salut' } },
        ],
      },
      {
        id: 'names',
        type: 'NameGeneratorQuickAdd',
        label: { en: 'Names', fr: 'Noms' },
        subject: { entity: 'node', type: 'person' },
        quickAdd: asEntityAttributeReference('name_var'),
        prompts: [
          { id: 'p1', text: { en: 'Name people', fr: 'Nommez' } },
          { id: 'p2', text: { en: 'Name more', fr: 'Nommez plus' } },
        ],
        addNamePlaceholder: { en: 'Type a name', fr: 'Tapez un nom' },
      },
      {
        id: 'finish',
        type: 'FinishSession',
        mode: 'confirmation',
        outcome: 'completed',
        label: { en: 'Finish', fr: 'Fin' },
        finishLabel: { en: 'Finish', fr: 'Terminer' },
        finishConfirmation: { en: 'Finish now?', fr: 'Terminer ?' },
        finishFailed: { en: 'Could not finish.', fr: 'Échec.' },
        content: { en: 'The end.', fr: 'La fin.' },
        finishedContent: { en: 'Thank you.', fr: 'Merci.' },
      },
    ],
  });

/** The study details `reviewProtocolWithDetails` holds. */
export const SAVED_SYNOPSIS =
  'A survey of where older adults living alone get everyday advice.';
export const SAVED_POPULATION = 'Adults over 65 living alone';
export const SAVED_QUESTION = 'Who do older adults turn to for advice?';

/** The same protocol with the experiment on and study details already saved. */
export const reviewProtocolWithDetails = (): CurrentProtocol => ({
  ...reviewProtocol(),
  experiments: {
    protocolReview: {
      studyContext: {
        synopsis: SAVED_SYNOPSIS,
        population: SAVED_POPULATION,
        administration: 'face_to_face',
        researchQuestions: [SAVED_QUESTION],
      },
    },
  },
});

/** What the mocked findings change, so specs assert the same strings. */
export const NEW_P1_TEXT = 'Name everyone you know';
export const OLD_P1_TEXT = 'Name people';
export const NEW_P2_TEXT = 'Name up to five more people';
export const OLD_P2_TEXT = 'Name more';

/** A notice that counts with `#` and keeps the supplied wording's placements. */
const MIN_NODES_NOTICE = {
  en: '{count, plural, one {Name at least # person before you continue.} other {Name at least # people before you continue.}}',
  fr: '{count, plural, one {Nommez au moins # personne avant de continuer.} other {Nommez au moins # personnes avant de continuer.}}',
};

type FixOp = {
  op: 'set' | 'remove' | 'insert';
  path: string;
  value: string | null;
};

export type MockFinding = {
  id: string;
  severity: 'serious' | 'worth_fixing' | 'suggestion';
  category: string;
  title: string;
  explanation: string;
  stageId: string | null;
  codebookEntity: 'node' | 'edge' | 'ego' | null;
  codebookTypeId: string | null;
  fix: { summary: string; changes: string[]; operations: FixOp[] };
};

const set = (path: string, value: unknown): FixOp => ({
  op: 'set',
  path,
  value: JSON.stringify(value),
});

/**
 * Four problems, most serious first, addressed to the protocol above:
 * (a) a wording fix to a prompt, (b) a structurally valid fix that rewords the
 * other prompt and sets a stage setting, (c) a fix whose path does not exist,
 * so it cannot be made for the researcher, and advice with no edits at all.
 */
export const FINDINGS: MockFinding[] = [
  {
    id: 'wording',
    severity: 'serious',
    category: 'wording',
    title: 'The first prompt is vague',
    explanation: 'Participants may not know how many people to name.',
    stageId: 'names',
    codebookEntity: null,
    codebookTypeId: null,
    fix: {
      summary: 'Ask participants to name everyone they know.',
      changes: ['Stage 2 · Names: reword the first prompt'],
      operations: [set('/stages/names/prompts/p1/text/en', NEW_P1_TEXT)],
    },
  },
  {
    id: 'structural',
    severity: 'worth_fixing',
    category: 'burden',
    title: 'The second prompt has no limit on how many to name',
    explanation: 'Open-ended naming is tiring and makes interviews long.',
    stageId: 'names',
    codebookEntity: null,
    codebookTypeId: null,
    fix: {
      summary: 'Ask for up to five people, and require at least two.',
      changes: [
        'Stage 2 · Names: reword the second prompt',
        'Stage 2 · Names: require at least two names',
      ],
      operations: [
        set('/stages/names/prompts/p2/text/en', NEW_P2_TEXT),
        set('/stages/names/behaviours', { minNodes: 2 }),
        // A minimum is shown with a notice, and the schema refuses a stage that
        // has one without the other, so a valid fix sets both.
        set('/stages/names/minNodesNotice', MIN_NODES_NOTICE),
      ],
    },
  },
  {
    id: 'cannot',
    severity: 'worth_fixing',
    category: 'structure',
    title: 'The closing stage repeats the welcome',
    explanation: 'Participants see the same words at the start and the end.',
    stageId: 'finish',
    codebookEntity: null,
    codebookTypeId: null,
    fix: {
      summary: 'Reword the closing stage.',
      changes: ['Stage 3 · Finish: reword the closing text'],
      operations: [
        set('/stages/no-such-stage/content/en', 'Thanks for taking part'),
      ],
    },
  },
  {
    id: 'advice',
    severity: 'suggestion',
    category: 'research_fit',
    title: 'Nothing answers the research question',
    explanation: 'No stage collects who gives advice to whom.',
    stageId: null,
    codebookEntity: null,
    codebookTypeId: null,
    fix: {
      summary: 'Add a stage that asks about advice.',
      changes: ['Add a stage after Names'],
      operations: [],
    },
  },
];

type ReviewBody = {
  installationId: string;
  provider: string;
  locale: string;
  share: boolean;
  studyContext: {
    synopsis: string;
    population: string;
    administration: string;
    researchQuestions: string[];
  };
  protocol: Record<string, unknown>;
};

const holdsText = (value: unknown) =>
  typeof value === 'string' && /\S/u.test(value);

/**
 * Whether `studyContext` is what the service accepts: a synopsis and a
 * population that hold text, an administration mode, and any number of
 * research questions (none included), each holding text.
 */
const isValidStudyContext = (value: unknown) =>
  isRecord(value) &&
  holdsText(value.synopsis) &&
  holdsText(value.population) &&
  (value.administration === 'face_to_face' ||
    value.administration === 'self_administered') &&
  Array.isArray(value.researchQuestions) &&
  value.researchQuestions.every(holdsText);

/** One provider's line in the answer to `GET /providers`. */
export type MockProviderStatus = {
  provider: 'anthropic' | 'openai';
  available: boolean;
  reason: 'daily_limit' | 'monthly_limit' | null;
  retryAt: string | null;
};

const EVERY_PROVIDER_AVAILABLE: MockProviderStatus[] = [
  { provider: 'anthropic', available: true, reason: null, retryAt: null },
  { provider: 'openai', available: true, reason: null, retryAt: null },
];

export type ReviewReply =
  | { kind: 'result'; findings: MockFinding[]; delayMs?: number }
  | { kind: 'error'; status: number; error: string; retryAt: string | null };

const resultEvents = (findings: MockFinding[]) => {
  const data = (event: unknown) => `data: ${JSON.stringify(event)}\n\n`;
  return (
    data({ type: 'progress', received: 400 }) +
    data({ type: 'progress', received: 1800 }) +
    data({
      type: 'result',
      result: {
        reviewId: REVIEW_ID,
        findings,
        quota: {
          limit: 5,
          remaining: 4,
          resetsAt: new Date(Date.now() + 3_600_000).toISOString(),
        },
      },
    })
  );
};

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

/**
 * Stands in for the review service on `context`, answering the CORS
 * preflight, each `GET /providers` with `providers`, and each `POST /review`
 * with `reply` (both read afresh for every request, so a spec can change them
 * as it goes). Every body the app sent is recorded, and nothing is sent
 * anywhere real.
 */
export async function mockReviewService(
  context: BrowserContext,
  initial: ReviewReply,
  initialProviders: MockProviderStatus[] = EVERY_PROVIDER_AVAILABLE,
) {
  let reply = initial;
  let providers = initialProviders;
  const bodies: ReviewBody[] = [];
  let preflights = 0;
  let providerRequests = 0;

  await context.route(`${REVIEW_SERVICE_ORIGIN}/**`, async (route: Route) => {
    const request = route.request();
    const origin = request.headers().origin ?? '*';
    const cors = {
      'access-control-allow-origin': origin,
      'vary': 'Origin',
    };
    if (request.method() === 'OPTIONS') {
      preflights += 1;
      await route.fulfill({
        status: 204,
        headers: {
          ...cors,
          'access-control-allow-methods': 'GET, POST, OPTIONS',
          'access-control-allow-headers': 'content-type, accept',
          'access-control-max-age': '0',
        },
      });
      return;
    }
    if (request.method() === 'GET') {
      if (new URL(request.url()).pathname !== '/providers') {
        throw new Error(`unexpected GET ${request.url()}`);
      }
      // The app must send nothing about the researcher with this question.
      if (request.postData() !== null) {
        throw new Error('the provider question carried a body');
      }
      providerRequests += 1;
      await route.fulfill({
        status: 200,
        headers: {
          ...cors,
          'content-type': 'application/json',
          'cache-control': 'no-store',
        },
        body: JSON.stringify({ providers }),
      });
      return;
    }
    const parsed: unknown = JSON.parse(request.postData() ?? 'null');
    if (!isRecord(parsed)) throw new Error('review request body is not JSON');
    // Keep the body as sent; the specs assert on its fields one by one.
    bodies.push(JSON.parse(JSON.stringify(parsed)) as ReviewBody);

    // The service refuses study details it does not accept, as the real one
    // does, so a request that breaks the contract never gets a result.
    if (!isValidStudyContext(parsed.studyContext)) {
      await route.fulfill({
        status: 400,
        headers: { ...cors, 'content-type': 'application/json' },
        body: JSON.stringify({ error: 'invalid_request', retryAt: null }),
      });
      return;
    }

    const current = reply;
    if (current.kind === 'error') {
      await route.fulfill({
        status: current.status,
        headers: { ...cors, 'content-type': 'application/json' },
        body: JSON.stringify({
          error: current.error,
          retryAt: current.retryAt,
        }),
      });
      return;
    }
    if (current.delayMs) {
      await new Promise((resolve) => setTimeout(resolve, current.delayMs));
    }
    await route.fulfill({
      status: 200,
      headers: { ...cors, 'content-type': 'text/event-stream' },
      body: resultEvents(current.findings),
    });
  });

  return {
    bodies,
    preflights: () => preflights,
    providerRequests: () => providerRequests,
    reply(next: ReviewReply) {
      reply = next;
    },
    providers(next: MockProviderStatus[]) {
      providers = next;
    },
  };
}
