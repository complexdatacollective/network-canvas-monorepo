import { type Cause, Effect, Layer, Queue, Result } from 'effect';
import { describe, expect, it, vi } from 'vitest';

import {
  entityAttributesProperty,
  entityPrimaryKeyProperty,
} from '@codaco/shared-consts';

import { DatabaseError, describeExportError } from '../errors';
import type { ExportEvent } from '../events';
import type { InterviewExportInput, ProtocolExportInput } from '../input';
import type { OutputEntry } from '../output';
import { exportPipeline } from '../pipeline';
import { InterviewRepository } from '../services/InterviewRepository';
import { Output } from '../services/Output';
import { ProtocolRepository } from '../services/ProtocolRepository';
import type * as GetFormatterModule from '../utils/getFormatter';
import { runRecordedExport } from './exportHarness';
import { testTypeId, testVariableId } from './testIds';

const mockFormatters = vi.hoisted(() => ({ failAttributeList: true }));

vi.mock('../utils/getFormatter', async (importOriginal) => {
  const original = await importOriginal<typeof GetFormatterModule>();
  return {
    ...original,
    getFormatter: (format: Parameters<typeof original.getFormatter>[0]) => {
      if (format === 'attributeList' && mockFormatters.failAttributeList) {
        return () => {
          throw new Error('mock formatter failure');
        };
      }
      return original.getFormatter(format);
    },
  };
});

const defaultExportOptions = {
  exportGraphML: true,
  exportCSV: false,
  globalOptions: {
    useScreenLayoutCoordinates: true,
    screenLayoutHeight: 1080,
    screenLayoutWidth: 1920,
  },
};

const protocol = (hash: string): ProtocolExportInput => ({
  hash,
  name: `Protocol ${hash}`,
  codebook: { node: {}, edge: {} },
  layoutNodeTypes: {},
});

const recordingOutput = () => {
  const writes: string[] = [];
  const Layer_ = Layer.succeed(Output, {
    begin: () => Effect.succeed({ id: 'h' }),
    writeEntry: (_h, entry: OutputEntry) =>
      Effect.sync(() => {
        writes.push(entry.name);
      }),
    end: () => Effect.succeed({ key: 'k', url: 'http://test/k' }),
  });
  return { layer: Layer_, writes };
};

describe('exportPipeline', () => {
  it('returns error when database fetch fails', async () => {
    const MockRepo = Layer.succeed(InterviewRepository, {
      getForExport: () =>
        Effect.fail(
          new DatabaseError({ cause: new Error('connection refused') }),
        ),
    });
    const MockProtocols = Layer.succeed(ProtocolRepository, {
      getProtocols: () => Effect.succeed({}),
    });
    const { layer: Out } = recordingOutput();
    const layer = Layer.mergeAll(MockRepo, MockProtocols, Out);

    const result = await Effect.gen(function* () {
      const queue = yield* Queue.unbounded<ExportEvent>();
      return yield* exportPipeline(
        ['test-id'],
        defaultExportOptions,
        queue,
      ).pipe(
        Effect.catch((error) =>
          Effect.succeed({
            status: 'error' as const,
            error: describeExportError(error, 'fetching interviews'),
          }),
        ),
      );
    }).pipe(Effect.provide(layer), Effect.runPromise);

    expect(result.status).toBe('error');
    if (result.status !== 'error') throw new Error('Expected error status');
    expect(result.error).toMatch(
      /database connection failed.*fetching interviews/i,
    );
  });

  it('emits all stage events in order on successful export', async () => {
    const session: InterviewExportInput = {
      id: 'test-interview-1',
      participantIdentifier: 'p1',
      startTime: new Date('2025-01-01'),
      finishTime: new Date('2025-01-01'),
      network: {
        nodes: [],
        edges: [],
        ego: { _uid: 'ego-1', [entityAttributesProperty]: {} },
      },
      protocolHash: 'h1',
      finishOutcome: 'completed',
    };

    const MockRepo = Layer.succeed(InterviewRepository, {
      getForExport: () => Effect.succeed([session]),
    });
    const MockProtocols = Layer.succeed(ProtocolRepository, {
      getProtocols: () => Effect.succeed({ h1: protocol('h1') }),
    });
    const { layer: Out } = recordingOutput();
    const layer = Layer.mergeAll(MockRepo, MockProtocols, Out);

    const { result, events } = await Effect.gen(function* () {
      const queue = yield* Queue.unbounded<ExportEvent, Cause.Done>();
      const pipelineResult = yield* exportPipeline(
        ['test-interview-1'],
        defaultExportOptions,
        queue,
      ).pipe(
        Effect.catch((error) =>
          Effect.succeed({
            status: 'error' as const,
            error: describeExportError(error),
          }),
        ),
      );
      yield* Queue.end(queue);
      const drained = yield* Effect.result(Queue.takeAll(queue));
      const allEvents: ExportEvent[] = Result.isSuccess(drained)
        ? [...drained.success]
        : [];
      return { result: pipelineResult, events: allEvents };
    }).pipe(Effect.provide(layer), Effect.runPromise);

    const stageOrder = events
      .filter((e) => e.type === 'stage')
      .map((e) => (e.type === 'stage' ? e.stage : ''));
    expect(stageOrder).toEqual([
      'fetching',
      'formatting',
      'generating',
      'outputting',
    ]);
    expect(result.status).not.toBe('error');
  });

  it('returns status=partial when one file generation fails', async () => {
    const session: InterviewExportInput = {
      id: 'test-interview-2',
      participantIdentifier: 'p2',
      startTime: new Date('2025-01-01'),
      finishTime: new Date('2025-01-01'),
      network: {
        nodes: [],
        edges: [],
        ego: { _uid: 'ego-2', [entityAttributesProperty]: {} },
      },
      protocolHash: 'h2',
      finishOutcome: 'completed',
    };

    const MockRepo = Layer.succeed(InterviewRepository, {
      getForExport: () => Effect.succeed([session]),
    });
    const MockProtocols = Layer.succeed(ProtocolRepository, {
      getProtocols: () => Effect.succeed({ h2: protocol('h2') }),
    });
    const { layer: Out, writes } = recordingOutput();
    const layer = Layer.mergeAll(MockRepo, MockProtocols, Out);

    const opts = { ...defaultExportOptions, exportCSV: true };

    const result = await Effect.gen(function* () {
      const queue = yield* Queue.unbounded<ExportEvent>();
      return yield* exportPipeline(['test-interview-2'], opts, queue);
    }).pipe(Effect.provide(layer), Effect.runPromise);

    expect(result.status).toBe('partial');
    expect(result.failedExports).toHaveLength(1);
    expect(result.failedExports[0]?.kind).toBe('generation');
    if (result.failedExports[0]?.kind === 'generation') {
      expect(result.failedExports[0].format).toBe('attributeList');
      expect(result.failedExports[0].sessionId).toBe('test-interview-2');
    }
    expect(result.successfulExports.length).toBeGreaterThan(0);
    expect(writes.length).toBe(result.successfulExports.length);
    expect(result.output.key).toBe('k');
    expect(result.output.url).toBe('http://test/k');
  });

  it('routes sessions whose protocol is missing into failedExports with kind=protocol-missing', async () => {
    const sessions: InterviewExportInput[] = [
      {
        id: 's-ok',
        participantIdentifier: 'p-ok',
        startTime: new Date('2025-01-01'),
        finishTime: new Date('2025-01-01'),
        network: {
          nodes: [],
          edges: [],
          ego: { _uid: 'ego', [entityAttributesProperty]: {} },
        },
        protocolHash: 'hA',
        finishOutcome: 'completed',
      },
      {
        id: 's-missing',
        participantIdentifier: 'p-missing',
        startTime: new Date('2025-01-01'),
        finishTime: new Date('2025-01-01'),
        network: {
          nodes: [],
          edges: [],
          ego: { _uid: 'ego', [entityAttributesProperty]: {} },
        },
        protocolHash: 'hMISSING',
        finishOutcome: 'completed',
      },
    ];

    const MockRepo = Layer.succeed(InterviewRepository, {
      getForExport: () => Effect.succeed(sessions),
    });
    const MockProtocols = Layer.succeed(ProtocolRepository, {
      getProtocols: () => Effect.succeed({ hA: protocol('hA') }),
    });
    const { layer: Out } = recordingOutput();
    const layer = Layer.mergeAll(MockRepo, MockProtocols, Out);

    const result = await Effect.gen(function* () {
      const queue = yield* Queue.unbounded<ExportEvent>();
      return yield* exportPipeline(
        ['s-ok', 's-missing'],
        defaultExportOptions,
        queue,
      );
    }).pipe(Effect.provide(layer), Effect.runPromise);

    expect(result.status).toBe('partial');
    const missingFailures = result.failedExports.filter(
      (f) => f.kind === 'protocol-missing',
    );
    expect(missingFailures).toHaveLength(1);
    expect(missingFailures[0]?.sessionId).toBe('s-missing');
    expect(result.successfulExports.length).toBeGreaterThan(0);
  });

  it('no export file contains endpoint rules', async () => {
    const person = testTypeId('person');
    const place = testTypeId('place');
    const visits = testTypeId('visits');
    const knows = testTypeId('knows');
    const nameVariable = testVariableId('name');
    const node = (uid: string, type: string, name: string) => ({
      [entityPrimaryKeyProperty]: uid,
      type,
      [entityAttributesProperty]: { [nameVariable]: name },
    });
    const session: InterviewExportInput = {
      id: 'interview-rules',
      participantIdentifier: 'p-rules',
      startTime: new Date('2025-01-01'),
      finishTime: new Date('2025-01-01'),
      network: {
        nodes: [
          node('n1', person, 'Dee'),
          node('n2', person, 'Carl'),
          node('n3', place, 'Park'),
        ],
        edges: [
          {
            [entityPrimaryKeyProperty]: 'e1',
            from: 'n1',
            to: 'n3',
            type: visits,
            [entityAttributesProperty]: {},
          },
          {
            [entityPrimaryKeyProperty]: 'e2',
            from: 'n2',
            to: 'n1',
            type: knows,
            [entityAttributesProperty]: {},
          },
        ],
        ego: {
          [entityPrimaryKeyProperty]: 'ego',
          [entityAttributesProperty]: {},
        },
      },
      protocolHash: 'rules',
      finishOutcome: 'completed',
    };
    const nodeType = (name: string) => ({
      name,
      color: 'node-color-seq-1',
      shape: { default: 'circle' as const },
      variables: { [nameVariable]: { name: 'name', type: 'text' as const } },
    });

    mockFormatters.failAttributeList = false;
    try {
      const { files, result } = await runRecordedExport(
        { ...defaultExportOptions, exportCSV: true },
        [session],
        {
          hash: 'rules',
          name: 'Rules',
          codebook: {
            node: { [person]: nodeType('Person'), [place]: nodeType('Place') },
            edge: {
              [visits]: {
                name: 'Visits',
                color: 'edge-color-seq-1',
                directed: true,
                endpointRules: [{ sourceType: person, targetType: place }],
              },
              [knows]: {
                name: 'Knows',
                color: 'edge-color-seq-2',
                endpointRules: [{ sourceType: person, targetType: person }],
              },
            },
          },
          layoutNodeTypes: {},
        },
      );

      expect(result.status).toBe('success');
      const names = [...files.keys()];
      for (const ending of [
        '.graphml',
        '_attributeList_Person.csv',
        '_attributeList_Place.csv',
        '_edgeList_Visits.csv',
        '_edgeList_Knows.csv',
        '_ego.csv',
      ]) {
        expect({
          ending,
          written: names.some((name) => name.endsWith(ending)),
        }).toEqual({
          ending,
          written: true,
        });
      }
      for (const [name, text] of files) {
        for (const word of ['endpointRules', 'sourceType', 'targetType']) {
          expect({ name, word, found: text.includes(word) }).toEqual({
            name,
            word,
            found: false,
          });
        }
      }
    } finally {
      mockFormatters.failAttributeList = true;
    }
  });
});
