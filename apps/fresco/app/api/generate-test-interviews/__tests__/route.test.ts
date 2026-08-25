import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import type { SyntheticInterviewResult } from '@codaco/protocol-utilities';
import {
  type CurrentProtocol,
  CurrentProtocolSchema,
} from '@codaco/protocol-validation';

const { addEvent, generateInterviews, prisma, requireApiAuth } = vi.hoisted(
  () => ({
    addEvent: vi.fn(),
    generateInterviews: vi.fn(),
    prisma: {
      protocol: { findUnique: vi.fn() },
      interview: { create: vi.fn() },
      participant: { findMany: vi.fn() },
    },
    requireApiAuth: vi.fn(),
  }),
);

vi.mock('~/lib/activityFeed', () => ({ addEvent }));
vi.mock('~/lib/auth/guards', () => ({ requireApiAuth }));
vi.mock('~/lib/db', () => ({ prisma }));

// Only the engine entry is replaced; everything else the route reads from the
// package (the batch ceiling the request schema enforces) stays real.
vi.mock('@codaco/protocol-utilities', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@codaco/protocol-utilities')>()),
  generateInterviews,
}));

import { POST } from '~/app/api/generate-test-interviews/route';

const PROTOCOL_ID = 'protocol-1';

/** A minimal, asset-free v8 protocol: nothing here needs a fetch to generate. */
const DOCUMENT = {
  schemaVersion: 8,
  name: 'Synthetic Test',
  codebook: {
    node: {
      person: {
        name: 'Person',
        color: 'node-color-seq-1',
        shape: { default: 'circle' },
        variables: {
          'var-name': { name: 'name', type: 'text', component: 'Text' },
        },
      },
    },
    edge: {},
    ego: {},
  },
  stages: [
    {
      id: 'stage-people',
      type: 'NameGenerator',
      label: 'People',
      subject: { entity: 'node', type: 'person' },
      form: {
        title: 'Add a person',
        fields: [{ variable: 'var-name', prompt: 'Their name' }],
      },
      prompts: [{ id: 'prompt-people', text: 'Who do you know?' }],
    },
    {
      id: 'stage-thanks',
      type: 'Information',
      label: 'Thanks',
      title: 'Thank you',
      items: [],
    },
  ],
};

/**
 * The stored columns, as Fresco's Prisma result extension hands them back:
 * `stages` and `codebook` parsed per field, with no manifest anywhere.
 */
const STORED = CurrentProtocolSchema.parse(DOCUMENT);

/**
 * The same protocol with a roster stage, whose asset row is then withheld — the
 * shape a protocol takes when its stored stages outlive the asset table.
 */
const STORED_WITH_ROSTER = CurrentProtocolSchema.parse({
  ...DOCUMENT,
  stages: [
    {
      id: 'stage-roster',
      type: 'NameGeneratorRoster',
      label: 'Roster',
      subject: { entity: 'node', type: 'person' },
      dataSource: 'missing-roster',
      prompts: [{ id: 'prompt-roster', text: 'Pick people you know' }],
    },
  ],
  assetManifest: {
    'missing-roster': {
      name: 'roster.json',
      type: 'network',
      source: 'roster.json',
    },
  },
});

const emptyNetwork = () => ({
  nodes: [],
  edges: [],
  ego: { _uid: 'ego-1', attributes: {} },
});

const session = (
  overrides: Partial<SyntheticInterviewResult['session']> = {},
): SyntheticInterviewResult['session'] => ({
  id: 'session-1',
  startTime: '2026-08-10T09:00:00.000Z',
  finishTime: '2026-08-10T09:25:00.000Z',
  exportTime: null,
  lastUpdated: '2026-08-10T09:25:00.000Z',
  network: emptyNetwork(),
  promptIndex: 0,
  ...overrides,
});

/** One finished session and one genuine drop-out, as the engine returns them. */
const RESULTS: SyntheticInterviewResult[] = [
  {
    session: session(),
    currentStep: 2,
    droppedOut: false,
    visitedStages: [0, 1],
  },
  {
    session: session({
      id: 'session-2',
      startTime: '2026-08-11T14:00:00.000Z',
      finishTime: null,
      lastUpdated: '2026-08-11T14:06:00.000Z',
    }),
    currentStep: 1,
    droppedOut: true,
    visitedStages: [0],
  },
];

const postGenerate = (body: Record<string, unknown>) =>
  POST(
    new Request('http://localhost/api/generate-test-interviews', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    }),
  );

type SseEvent = Record<string, unknown> & { type: string };

const readEvents = async (response: Response): Promise<SseEvent[]> =>
  (await response.text())
    .split('\n\n')
    .filter((chunk) => chunk.startsWith('data: '))
    .map((chunk) => JSON.parse(chunk.slice(6)) as SseEvent);

beforeEach(() => {
  requireApiAuth.mockResolvedValue({ user: { username: 'tester' } });
  prisma.protocol.findUnique.mockResolvedValue({
    id: PROTOCOL_ID,
    name: STORED.name,
    description: null,
    lastModified: new Date('2026-08-01T09:00:00.000Z'),
    stages: STORED.stages,
    codebook: STORED.codebook,
    experiments: {},
    assets: [],
  });
  prisma.interview.create.mockImplementation(() =>
    Promise.resolve({
      id: `interview-${String(prisma.interview.create.mock.calls.length)}`,
    }),
  );
  prisma.participant.findMany.mockResolvedValue([]);
  generateInterviews.mockReturnValue(RESULTS);
});

afterEach(() => {
  vi.clearAllMocks();
});

describe('generating synthetic interviews', () => {
  it('drives one batch through the engine with the requested options', async () => {
    const response = await postGenerate({
      protocolId: PROTOCOL_ID,
      count: 2,
      simulateDropOut: true,
      respectSkipLogicAndFiltering: true,
      seed: 4242,
    });
    await readEvents(response);

    expect(generateInterviews).toHaveBeenCalledTimes(1);
    const [protocol, options] = generateInterviews.mock.calls[0] as [
      CurrentProtocol,
      Record<string, unknown>,
    ];

    // The batch floor, the drop-out die and the walk's skip-logic handling are
    // all the engine's now: the route states the run's options once and does no
    // regeneration of its own.
    expect(options).toStrictEqual({
      count: 2,
      seed: 4242,
      // Drawn day-quantised when the request pins none, so the reported
      // token reconstructs it exactly.
      startWindow: options.startWindow,
      simulateDropOut: true,
      // The one request field threads to BOTH engine flags: the setting has
      // always been labelled "skip logic and filtering".
      respectSkipLogic: true,
      respectFiltering: true,
    });
    expect(String(options.startWindow)).toMatch(
      /^\d{4}-\d{2}-\d{2}T00:00:00\.000Z$/,
    );

    // What it is handed is parse output, which is what the engine requires:
    // the stored columns carry no `synthetic` descriptors until re-parsed.
    expect(
      protocol.stages.filter(
        (stage) => (stage as { synthetic?: unknown }).synthetic === undefined,
      ),
    ).toStrictEqual([]);
  });

  it('persists a drop-out as a genuine unfinished interview', async () => {
    const response = await postGenerate({
      protocolId: PROTOCOL_ID,
      count: 2,
      simulateDropOut: true,
      respectSkipLogicAndFiltering: false,
    });
    await readEvents(response);

    expect(prisma.interview.create).toHaveBeenCalledTimes(2);
    const written = prisma.interview.create.mock.calls.map(
      ([argument]) => (argument as { data: Record<string, unknown> }).data,
    );

    // The engine's own timestamps, not fabricated ones: a session that finished
    // has the instant it finished at, and one that was abandoned has none — and
    // resumes at the step its participant stopped on.
    expect(written[0]).toMatchObject({
      startTime: new Date('2026-08-10T09:00:00.000Z'),
      finishTime: new Date('2026-08-10T09:25:00.000Z'),
      currentStep: 2,
      isSynthetic: true,
    });
    expect(written[1]).toMatchObject({
      startTime: new Date('2026-08-11T14:00:00.000Z'),
      finishTime: null,
      currentStep: 1,
      isSynthetic: true,
    });
  });

  it('reports the engine’s progress and each write, then the batch seed', async () => {
    // Progress arrives from the engine's own `onProgress` for the generating
    // half and from each write for the saving half, so the batch is never
    // silently working.
    generateInterviews.mockImplementation(
      (
        _protocol: unknown,
        _options: unknown,
        _assetData: unknown,
        onProgress?: (done: number, total: number) => void,
      ) => {
        RESULTS.forEach((_result, index) => onProgress?.(index + 1, 2));
        return RESULTS;
      },
    );

    const events = await readEvents(
      await postGenerate({
        protocolId: PROTOCOL_ID,
        count: 2,
        simulateDropOut: false,
        respectSkipLogicAndFiltering: false,
        seed: 99,
      }),
    );

    const [, options] = generateInterviews.mock.calls[0] as [
      unknown,
      { startWindow: string },
    ];
    expect(events).toStrictEqual([
      { type: 'progress', phase: 'generating', current: 1, total: 2 },
      { type: 'progress', phase: 'generating', current: 2, total: 2 },
      { type: 'progress', phase: 'saving', current: 1, total: 2 },
      { type: 'progress', phase: 'saving', current: 2, total: 2 },
      {
        type: 'complete',
        created: 2,
        participantsCreated: 2,
        seed: 99,
        startWindow: options.startWindow,
        batchToken: `99-${options.startWindow.slice(0, 10)}`,
      },
    ]);
  });

  it('draws a fresh seed when the request pins none, and reports it', async () => {
    const events = await readEvents(
      await postGenerate({
        protocolId: PROTOCOL_ID,
        count: 2,
        simulateDropOut: false,
        respectSkipLogicAndFiltering: false,
      }),
    );

    const [, options] = generateInterviews.mock.calls[0] as [
      unknown,
      { seed: number; startWindow: string },
    ];
    const complete = events.at(-1);

    expect(Number.isInteger(options.seed)).toBe(true);
    // The whole identity travels back — seed, anchor, and the one copyable
    // token that carries both — because the seed alone cannot regenerate the
    // batch: its dates, and every date-relative drawn value, follow the
    // anchor.
    expect(complete).toStrictEqual({
      type: 'complete',
      created: 2,
      participantsCreated: 2,
      seed: options.seed,
      startWindow: options.startWindow,
      batchToken: `${String(options.seed)}-${options.startWindow.slice(0, 10)}`,
    });
  });

  it('replays a reported batch token as the batch it names', async () => {
    await readEvents(
      await postGenerate({
        protocolId: PROTOCOL_ID,
        count: 2,
        simulateDropOut: false,
        respectSkipLogicAndFiltering: false,
        batchToken: '4242-2026-08-01',
      }),
    );

    const [, options] = generateInterviews.mock.calls[0] as [
      unknown,
      { seed: number; startWindow: string },
    ];
    expect(options.seed).toBe(4242);
    expect(options.startWindow).toBe('2026-08-01T00:00:00.000Z');
  });

  it('reports how many participants a replay actually created', async () => {
    // The replay reconnects to the participants the first run created, so the
    // batch adds interviews and nobody at all; a count of one person per
    // interview would tell the dashboard its test population had doubled.
    prisma.participant.findMany.mockResolvedValue([
      { identifier: 'test-session-1' },
      { identifier: 'test-session-2' },
    ]);

    const events = await readEvents(
      await postGenerate({
        protocolId: PROTOCOL_ID,
        count: 2,
        simulateDropOut: false,
        respectSkipLogicAndFiltering: false,
        batchToken: '4242-2026-08-01',
      }),
    );

    expect(events.at(-1)).toMatchObject({
      type: 'complete',
      created: 2,
      participantsCreated: 0,
    });
  });

  it('surfaces a constraint refusal as a structured error, writing nothing', async () => {
    const conflicts = [
      {
        entity: 'node',
        entityType: 'person',
        variableIds: ['var-name'],
        variableNames: ['name'],
        rules: ['minLength'],
        reason: 'no value can satisfy this rule',
      },
    ];
    generateInterviews.mockImplementation(() => {
      // Shaped exactly as `SyntheticDataConstraintError` is, and recognised the
      // same way the route recognises the real one: by name, never by
      // `instanceof` across a package boundary.
      const error = Object.assign(
        new Error('Synthetic data cannot be generated'),
        {
          name: 'SyntheticDataConstraintError',
          conflicts,
        },
      );
      throw error;
    });

    const events = await readEvents(
      await postGenerate({
        protocolId: PROTOCOL_ID,
        count: 2,
        simulateDropOut: true,
        respectSkipLogicAndFiltering: false,
      }),
    );

    expect(events).toStrictEqual([
      {
        type: 'error',
        code: 'constraint-conflict',
        message: 'Synthetic data cannot be generated',
        conflicts,
      },
    ]);
    expect(prisma.interview.create).not.toHaveBeenCalled();
  });

  it('refuses before opening a stream when the stored protocol will not parse', async () => {
    prisma.protocol.findUnique.mockResolvedValue({
      id: PROTOCOL_ID,
      name: STORED.name,
      description: null,
      lastModified: new Date('2026-08-01T09:00:00.000Z'),
      codebook: STORED_WITH_ROSTER.codebook,
      // A stage referencing a roster asset no stored row provides: the
      // reassembled manifest cannot resolve it, so the document is refused.
      stages: STORED_WITH_ROSTER.stages,
      experiments: {},
      assets: [],
    });

    const response = await postGenerate({
      protocolId: PROTOCOL_ID,
      count: 1,
      simulateDropOut: false,
      respectSkipLogicAndFiltering: false,
    });

    expect(response.status).toBe(422);
    expect(((await response.json()) as { error: string }).error).toContain(
      'missing-roster',
    );
    expect(generateInterviews).not.toHaveBeenCalled();
  });

  it('rejects a batch larger than the engine’s ceiling', async () => {
    const response = await postGenerate({
      protocolId: PROTOCOL_ID,
      count: 1001,
      simulateDropOut: false,
      respectSkipLogicAndFiltering: false,
    });

    expect(response.status).toBe(400);
    expect(prisma.protocol.findUnique).not.toHaveBeenCalled();
  });
});
