import { beforeEach, describe, expect, it, vi } from 'vitest';

import type { InterviewExportInput } from '@codaco/network-exporters/input';
import type { ExportOptions } from '@codaco/network-exporters/options';
import {
  CurrentProtocolSchema,
  hashProtocol,
  type CurrentProtocol,
} from '@codaco/protocol-validation';

import {
  generateSyntheticExport,
  syntheticArchiveName,
} from '../generateSyntheticExport';

/**
 * What the generator hands the exporter, and what it hands back to its caller.
 *
 * The exporter itself is mocked at its module boundary — its behaviour is
 * tested in `@codaco/network-exporters` and re-testing it here would only prove
 * that package still works. What no other suite can prove is that the inputs
 * reaching it describe THIS protocol's interviews: a wrong protocol hash, a
 * missing codebook or a session whose times never became Dates all produce an
 * archive that looks fine and is wrong.
 */

const runExportPipeline = vi.hoisted(() => vi.fn());
const downloadBlob = vi.hoisted(() => vi.fn());

vi.mock('../runExportPipeline', () => ({ runExportPipeline }));

vi.mock('~/utils/downloadBlob', async (original) => ({
  ...(await original<typeof import('~/utils/downloadBlob')>()),
  downloadBlob,
}));

/**
 * The engine itself is NOT mocked — every interview below is really generated.
 * Only which of its two drivers was used is observed, because that is the one
 * thing about this call the archive cannot show: both draw the same batch, and
 * only one of them leaves the tab usable while it does.
 */
const drivers = vi.hoisted(() => ({
  synchronous: vi.fn(),
  asynchronous: vi.fn(),
}));

vi.mock('@codaco/protocol-utilities', async (original) => {
  const actual = await original<typeof import('@codaco/protocol-utilities')>();
  return {
    ...actual,
    generateInterviews: (
      ...args: Parameters<typeof actual.generateInterviews>
    ) => {
      drivers.synchronous();
      return actual.generateInterviews(...args);
    },
    generateInterviewsAsync: (
      ...args: Parameters<typeof actual.generateInterviewsAsync>
    ) => {
      drivers.asynchronous();
      return actual.generateInterviewsAsync(...args);
    },
  };
});

// The editor's asset store is not what this exercises; the engine's contract
// for "no roster was resolved" is an empty map, which this protocol needs
// nothing from.
vi.mock('~/utils/syntheticAssetData', () => ({
  collectSyntheticAssetData: vi.fn(async () => ({
    rosterNodes: {},
    geojsonPropertyValues: {},
  })),
}));

/**
 * A protocol exactly as Architect stores it: no `synthetic` descriptors, no
 * other schema-defaulted field written out. Parsing expands all of them, which
 * is what makes the parse hash a DIFFERENT protocol from the saved one.
 */
const savedDocument = {
  name: 'Export Wiring',
  schemaVersion: 8,
  codebook: {
    node: {
      person: {
        name: 'Person',
        color: 'node-color-seq-1',
        shape: { default: 'circle' },
        variables: {
          name: { name: 'name', type: 'text', component: 'Text' },
        },
      },
    },
  },
  stages: [
    {
      id: 'ng',
      type: 'NameGeneratorQuickAdd',
      label: 'Name some people',
      subject: { entity: 'node', type: 'person' },
      quickAdd: 'name',
      prompts: [{ id: 'p1', text: 'Who do you know?' }],
    },
  ],
} as unknown as CurrentProtocol;

const protocol: CurrentProtocol = CurrentProtocolSchema.parse({
  name: 'Export Wiring',
  schemaVersion: 8,
  codebook: {
    node: {
      person: {
        name: 'Person',
        color: 'node-color-seq-1',
        shape: { default: 'circle' },
        variables: {
          name: { name: 'name', type: 'text', component: 'Text' },
        },
      },
    },
  },
  stages: [
    {
      id: 'ng',
      type: 'NameGeneratorQuickAdd',
      label: 'Name some people',
      subject: { entity: 'node', type: 'person' },
      quickAdd: 'name',
      prompts: [{ id: 'p1', text: 'Who do you know?' }],
    },
  ],
});

type PipelineCall = {
  data: {
    sessions: InterviewExportInput[];
    protocols: Record<
      string,
      { hash: string; name: string; codebook: unknown }
    >;
  };
  options: ExportOptions;
};

const lastPipelineCall = (): PipelineCall => {
  const call = runExportPipeline.mock.calls.at(-1)?.[0] as
    | PipelineCall
    | undefined;
  if (!call) throw new Error('the export pipeline was never invoked');
  return call;
};

const blob = new Blob(['zip'], { type: 'application/zip' });

beforeEach(() => {
  runExportPipeline.mockReset();
  downloadBlob.mockReset();
  drivers.synchronous.mockReset();
  drivers.asynchronous.mockReset();
  runExportPipeline.mockResolvedValue({
    result: {
      status: 'success',
      successfulExports: [],
      failedExports: [],
      output: {},
    },
    blob,
    fileName: 'networkCanvasExport-1.zip',
  });
});

describe('generateSyntheticExport', () => {
  it('hands the exporter this protocol’s interviews, under this protocol’s hash', async () => {
    const summary = await generateSyntheticExport({
      protocol,
      protocolId: 'protocol-1',
      count: 3,
      seed: 7,
      simulateDropOut: false,
      respectSkipLogic: true,
    });

    expect(summary.sessionCount).toBe(3);
    const { data, options } = lastPipelineCall();

    expect(data.sessions).toHaveLength(3);
    const hash = hashProtocol(protocol);
    expect(Object.keys(data.protocols)).toEqual([hash]);
    expect(data.protocols[hash]).toEqual({
      hash,
      name: 'Export Wiring',
      codebook: protocol.codebook,
    });

    for (const session of data.sessions) {
      expect(session.protocolHash).toBe(hash);
      // The exporter reads times as Dates; the engine emits ISO strings, and a
      // string that reached the exporter would format as `Invalid Date`.
      expect(session.startTime).toBeInstanceOf(Date);
      expect(Number.isNaN(session.startTime.getTime())).toBe(false);
      // The same case id Interviewer gives a generated session.
      expect(session.participantIdentifier).toBe(`synthetic-${session.id}`);
      expect(session.network.nodes.length).toBeGreaterThan(0);
    }

    // Both formats: the point of generating here is to see what the protocol
    // exports, and half an answer is not that.
    expect(options.exportGraphML).toBe(true);
    expect(options.exportCSV).toBe(true);
  });

  it('never holds the tab’s thread for a whole batch', async () => {
    // A session costs real work and a batch may ask for a thousand of them, so
    // the synchronous driver would freeze the dialog for the entire draw —
    // progress reported into frames that never come, and eventually the
    // browser offering to kill the page.
    await generateSyntheticExport({
      protocol,
      protocolId: null,
      count: 2,
      seed: 7,
      simulateDropOut: false,
      respectSkipLogic: true,
    });

    expect(drivers.asynchronous).toHaveBeenCalledTimes(1);
    expect(drivers.synchronous).not.toHaveBeenCalled();
  });

  it('identifies the archive by the SAVED protocol’s hash, not the parse of it', async () => {
    // Interviewer hashes the document as it arrived, before validation
    // (`apps/interviewer/src/lib/protocol/importProtocol.ts`). Hashing the
    // parse here would give one `.netcanvas` two identities, so an analysis
    // grouping a synthetic archive with a real export by protocol hash would
    // silently split them into two protocols.
    const savedHash = hashProtocol(savedDocument);
    const parsedHash = hashProtocol(
      CurrentProtocolSchema.parse(savedDocument) as CurrentProtocol,
    );
    // Guards the oracle: if parsing ever stopped expanding defaults, the
    // assertion below would pass without proving anything.
    expect(parsedHash).not.toBe(savedHash);

    await generateSyntheticExport({
      protocol: savedDocument,
      protocolId: null,
      count: 1,
      seed: 7,
      simulateDropOut: false,
      respectSkipLogic: true,
    });

    const { data } = lastPipelineCall();
    expect(Object.keys(data.protocols)).toEqual([savedHash]);
    for (const session of data.sessions) {
      expect(session.protocolHash).toBe(savedHash);
    }
  });

  it('hands back the archive under a name that says it is synthetic, and saves nothing itself', async () => {
    const summary = await generateSyntheticExport({
      protocol,
      protocolId: 'protocol-1',
      count: 1,
      seed: 7,
      simulateDropOut: false,
      respectSkipLogic: true,
    });

    // The archive the exporter produced, unchanged, so the click that saves it
    // saves what was generated here.
    expect(summary.archive).toBe(blob);
    expect(summary.fileName).toMatch(
      /^Export_Wiring-synthetic-\d{4}-\d{2}-\d{2}_\d{2}-\d{2}\.zip$/,
    );
    // Saving from here would run `downloadBlob` long after the click that
    // started the run, which Safari drops as a pop-up — silently, so the
    // researcher would be told about a file that was never written.
    expect(downloadBlob).not.toHaveBeenCalled();
  });

  it('reports the seed it ran on, and that seed reproduces the batch', async () => {
    const first = await generateSyntheticExport({
      protocol,
      protocolId: null,
      count: 2,
      seed: 4242,
      simulateDropOut: false,
      respectSkipLogic: true,
    });
    const firstNetworks = lastPipelineCall().data.sessions.map(
      (session) => session.network,
    );

    const second = await generateSyntheticExport({
      protocol,
      protocolId: null,
      count: 2,
      seed: 4242,
      simulateDropOut: false,
      respectSkipLogic: true,
    });
    const secondNetworks = lastPipelineCall().data.sessions.map(
      (session) => session.network,
    );

    expect(first.seed).toBe(4242);
    expect(second.seed).toBe(4242);
    // Not merely "the seed was echoed back": the seed the researcher is shown
    // has to be the one that redraws these interviews.
    expect(secondNetworks).toEqual(firstNetworks);
  });

  it('draws and reports a seed when none is pinned', async () => {
    const summary = await generateSyntheticExport({
      protocol,
      protocolId: null,
      count: 1,
      simulateDropOut: false,
      respectSkipLogic: true,
    });

    expect(Number.isInteger(summary.seed)).toBe(true);
    // 42 is the engine's own fallback: reporting it would mean the host never
    // drew one, and every unpinned batch would be identical.
    const other = await generateSyntheticExport({
      protocol,
      protocolId: null,
      count: 1,
      simulateDropOut: false,
      respectSkipLogic: true,
    });
    expect(summary.seed).not.toBe(other.seed);
  });

  it('counts failures per interview, not per generated file', async () => {
    runExportPipeline.mockResolvedValue({
      result: {
        status: 'partial',
        successfulExports: [],
        // One interview, two formats: one interview's worth of bad news.
        failedExports: [
          { kind: 'generation', sessionId: 's-1', format: 'graphml' },
          { kind: 'generation', sessionId: 's-1', format: 'attributeList' },
        ],
        output: {},
      },
      blob,
      fileName: 'networkCanvasExport-1.zip',
    });

    const summary = await generateSyntheticExport({
      protocol,
      protocolId: null,
      count: 1,
      seed: 1,
      simulateDropOut: false,
      respectSkipLogic: true,
    });

    expect(summary.failedCount).toBe(1);
  });

  it('reports no archive at all when the pipeline produces no file', async () => {
    runExportPipeline.mockResolvedValue({
      result: {
        status: 'success',
        successfulExports: [],
        failedExports: [],
        output: {},
      },
      blob: null,
      fileName: null,
    });

    await expect(
      generateSyntheticExport({
        protocol,
        protocolId: null,
        count: 1,
        seed: 1,
        simulateDropOut: false,
        respectSkipLogic: true,
      }),
    ).rejects.toThrow(/without producing a file/);
    expect(downloadBlob).not.toHaveBeenCalled();
  });
});

describe('syntheticArchiveName', () => {
  it('is derived from the protocol name and a local timestamp', () => {
    expect(
      syntheticArchiveName('My Study v2', new Date(2026, 7, 22, 9, 5)),
    ).toBe('My_Study_v2-synthetic-2026-08-22_09-05.zip');
  });

  it('falls back to a usable name when the protocol has none', () => {
    expect(syntheticArchiveName('   ', new Date(2026, 7, 22, 9, 5))).toBe(
      'protocol-synthetic-2026-08-22_09-05.zip',
    );
  });
});
