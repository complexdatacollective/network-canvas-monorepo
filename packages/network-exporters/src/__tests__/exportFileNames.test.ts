import { Effect, Layer, Queue } from 'effect';
import { unzipSync } from 'fflate';
import { describe, expect, it } from 'vitest';

import type { Codebook } from '@codaco/protocol-validation';
import {
  entityAttributesProperty,
  entityPrimaryKeyProperty,
} from '@codaco/shared-consts';

import { OutputError } from '../errors';
import type { ExportEvent } from '../events';
import type { InterviewExportInput } from '../input';
import { makeZipOutput } from '../layers/ZipOutput';
import type { ExportOptions } from '../options';
import type { OutputEntry } from '../output';
import { exportPipeline } from '../pipeline';
import { InterviewRepository } from '../services/InterviewRepository';
import { Output } from '../services/Output';
import { ProtocolRepository } from '../services/ProtocolRepository';

const options: ExportOptions = {
  exportGraphML: true,
  exportCSV: true,
  globalOptions: {
    useScreenLayoutCoordinates: false,
    screenLayoutHeight: 1080,
    screenLayoutWidth: 1920,
  },
};

// Type ids stay restricted; every name below is one a researcher could type
// once names are free, and several become the same file name.
const nodeTypes = {
  closeFriendUpper: 'Close Friend',
  closeFriendLower: 'close friend',
  punctuationA: 'close?friend',
  punctuationB: 'close*friend',
  kanjiFriend: '友人',
  kanjiFamily: '家族',
  empty: '???',
  reserved: 'CON',
  long: '友'.repeat(200),
} as const;

const edgeTypes = {
  knowsA: 'Knows/well',
  knowsB: 'Knows\\well',
  ties: 'つながり',
} as const;

const codebook: Codebook = {
  node: Object.fromEntries(
    Object.entries(nodeTypes).map(([id, name]) => [
      id,
      {
        name,
        color: 'node-color-seq-1' as const,
        shape: { default: 'circle' as const },
        variables: {
          [`${id}-label`]: { name: 'Label', type: 'text' as const },
        },
      },
    ]),
  ),
  edge: Object.fromEntries(
    Object.entries(edgeTypes).map(([id, name]) => [id, { name }]),
  ),
};

const nodeIds = Object.keys(nodeTypes);
const edgeIds = Object.keys(edgeTypes);

const interview: InterviewExportInput = {
  id: 'interview-1',
  participantIdentifier: 'participant',
  startTime: new Date('2025-01-01'),
  finishTime: new Date('2025-01-02'),
  protocolHash: 'protocol-1',
  locale: null,
  network: {
    nodes: nodeIds.map((id) => ({
      [entityPrimaryKeyProperty]: `node-${id}`,
      type: id,
      [entityAttributesProperty]: { [`${id}-label`]: `a ${id} node` },
    })),
    edges: edgeIds.map((id, index) => ({
      [entityPrimaryKeyProperty]: `edge-${id}`,
      from: `node-${nodeIds[0]}`,
      to: `node-${nodeIds[index + 1]}`,
      type: id,
      [entityAttributesProperty]: {},
    })),
    ego: {
      [entityPrimaryKeyProperty]: 'ego-1',
      [entityAttributesProperty]: {},
    },
  },
};

const repositories = Layer.mergeAll(
  Layer.succeed(InterviewRepository, {
    getForExport: () => Effect.succeed([interview]),
  }),
  Layer.succeed(ProtocolRepository, {
    getProtocols: () =>
      Effect.succeed({
        'protocol-1': { hash: 'protocol-1', name: 'Protocol', codebook },
      }),
  }),
);

const decoder = new TextDecoder();

const readAll = async (data: AsyncIterable<Uint8Array>) => {
  let text = '';
  for await (const chunk of data)
    text += decoder.decode(chunk, { stream: true });
  return text;
};

const runPipeline = (output: Layer.Layer<Output>) =>
  Effect.gen(function* () {
    const queue = yield* Queue.unbounded<ExportEvent>();
    return yield* exportPipeline([interview.id], options, queue);
  }).pipe(Effect.provide(Layer.mergeAll(repositories, output)));

const bytes = (value: string) => new TextEncoder().encode(value).length;

describe('the file names of an export of types whose names collide', () => {
  const collect = async () => {
    const files = new Map<string, string>();
    const output = Layer.succeed(Output, {
      begin: () => Effect.succeed({ id: 'recording' }),
      writeEntry: (_handle, entry: OutputEntry) =>
        Effect.promise(async () => {
          // A duplicate name here would be a silently lost file.
          expect(files.has(entry.name)).toBe(false);
          files.set(entry.name, await readAll(entry.data));
        }),
      end: () => Effect.succeed({ key: 'k' }),
    });
    const result = await Effect.runPromise(runPipeline(output));
    return { files, result };
  };

  it('gives every file a name no other file has, even ignoring case', async () => {
    const { files, result } = await collect();
    const names = [...files.keys()];

    expect(result.status).toBe('success');
    expect(names).toHaveLength(
      // graphml + ego + one attribute list per node type + one edge list per edge type
      1 + 1 + nodeIds.length + edgeIds.length,
    );
    expect(new Set(names.map((name) => name.toLowerCase())).size).toBe(
      names.length,
    );
  });

  it('keeps every name within 255 bytes and free of what a file system refuses', async () => {
    const { files } = await collect();

    for (const name of files.keys()) {
      expect(bytes(name)).toBeLessThanOrEqual(255);
      expect(name).not.toMatch(/[\\/:*?"<>|\p{Cc}]/u);
      expect(name.isWellFormed()).toBe(true);
    }
  });

  it("keeps each type's name in its file name where it can, and puts its rows only in its own file", async () => {
    const { files } = await collect();

    for (const [id, typeName] of Object.entries(nodeTypes)) {
      const owners = [...files].filter(
        ([name, text]) =>
          name.endsWith('.csv') && text.includes(`a ${id} node`),
      );

      expect(owners).toHaveLength(1);
      const [[name, text] = []] = owners;
      expect(name).toContain('attributeList');
      expect(text?.match(/a \w+ node/g)).toEqual([`a ${id} node`]);
      if (/^[^\\/:*?"<>|]+$/.test(typeName) && typeName !== 'CON') {
        if (bytes(typeName) < 100) expect(name).toContain(typeName);
      }
    }
  });

  it('names the CJK types after themselves', async () => {
    const { files } = await collect();
    const names = [...files.keys()];

    expect(names).toContain('participant_interview-1_attributeList_友人.csv');
    expect(names).toContain('participant_interview-1_attributeList_家族.csv');
    expect(names).toContain('participant_interview-1_edgeList_つながり.csv');
  });

  it('names a type whose name is empty or collides by its id, and the same way on every run', async () => {
    const first = [...(await collect()).files.keys()].sort();
    const second = [...(await collect()).files.keys()].sort();

    expect(second).toEqual(first);
    expect(first).toContain('participant_interview-1_attributeList_empty.csv');
    expect(first).toContain(
      'participant_interview-1_attributeList_Close Friend_closeFriendUpper.csv',
    );
    expect(first).toContain(
      'participant_interview-1_attributeList_close friend_closeFriendLower.csv',
    );
    expect(first).toContain(
      'participant_interview-1_attributeList_closefriend_punctuationA.csv',
    );
    expect(first).toContain(
      'participant_interview-1_attributeList_closefriend_punctuationB.csv',
    );
  });

  it('writes every file into the zip, under the name it was given', async () => {
    const { files } = await collect();
    const zipped: { bytes: Uint8Array } = { bytes: new Uint8Array() };
    const sink = (stream: AsyncIterable<Uint8Array>, fileName: string) =>
      Effect.tryPromise({
        try: async () => {
          const chunks: Uint8Array[] = [];
          for await (const chunk of stream) chunks.push(chunk);
          zipped.bytes = new Uint8Array(chunks.flatMap((chunk) => [...chunk]));
          return { key: fileName };
        },
        catch: (cause) => new OutputError({ cause }),
      });

    const result = await Effect.runPromise(runPipeline(makeZipOutput(sink)));
    const entries = unzipSync(zipped.bytes);

    expect(result.status).toBe('success');
    expect(Object.keys(entries).sort()).toEqual([...files.keys()].sort());
    // Not the GraphML and ego files, which record the time of each export.
    for (const [name, text] of files) {
      if (name.includes('_attributeList_') || name.includes('_edgeList_')) {
        expect(decoder.decode(entries[name])).toBe(text);
      }
    }
  });
});
