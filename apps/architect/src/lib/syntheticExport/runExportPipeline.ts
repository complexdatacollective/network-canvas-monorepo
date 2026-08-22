import { Effect, Layer, Queue, Stream } from 'effect';

import type { ExportEvent } from '@codaco/network-exporters/events';
import type {
  InterviewExportInput,
  ProtocolExportInput,
} from '@codaco/network-exporters/input';
import { makeZipOutput } from '@codaco/network-exporters/layers/ZipOutput';
import type { ExportOptions } from '@codaco/network-exporters/options';
import type {
  ExportReturn,
  OutputResult,
} from '@codaco/network-exporters/output';
import { exportPipeline } from '@codaco/network-exporters/pipeline';
import { InterviewRepository } from '@codaco/network-exporters/services/InterviewRepository';
import { ProtocolRepository } from '@codaco/network-exporters/services/ProtocolRepository';

/**
 * The export pipeline, run in the browser over inputs that are already in
 * memory.
 *
 * Ported from Interviewer's `lib/export/exportPipelineRunner.ts`, and
 * deliberately the same shape: the two repositories are satisfied from plain
 * values rather than a database, and the ZIP output is collected into a `Blob`
 * instead of a file handle. Architect has no session store to read from — the
 * sessions it exports were drawn moments earlier by the synthetic engine — so
 * the repository layers are the whole of its "fetch" stage.
 *
 * Unlike Interviewer's, this runs on the main thread. Interviewer exports whole
 * studies of real interviews and moves the CPU-heavy stages into a worker to
 * keep a progress dialog smooth; Architect generates a researcher-sized batch
 * from one protocol behind a modal that is blocked for the duration, so a
 * worker would buy nothing but a second copy of the pipeline to keep in step.
 */

export type ExportPipelineData = {
  sessions: InterviewExportInput[];
  protocols: Record<string, ProtocolExportInput>;
};

export type ExportRun = {
  result: ExportReturn;
  blob: Blob | null;
  fileName: string | null;
};

function makeBlobSink() {
  let result: { blob: Blob; fileName: string } | null = null;
  const sink = (iterable: AsyncIterable<Uint8Array>, fileName: string) =>
    Effect.tryPromise({
      try: async (): Promise<OutputResult> => {
        const chunks: BlobPart[] = [];
        for await (const chunk of iterable) {
          chunks.push(new Uint8Array(chunk));
        }
        const blob = new Blob(chunks, { type: 'application/zip' });
        result = { blob, fileName };
        // No object URL: the caller names and saves the archive itself, and an
        // unrevoked URL would pin the zip-sized blob for the page lifetime.
        return { key: fileName };
      },
      catch: (cause) => {
        throw cause;
      },
    });
  return {
    sink,
    getResult: () => result,
  };
}

export async function runExportPipeline({
  data,
  options,
  onEvent,
  signal,
}: {
  data: ExportPipelineData;
  options: ExportOptions;
  onEvent?: (event: ExportEvent) => void;
  signal?: AbortSignal;
}): Promise<ExportRun> {
  const interviewRepoLayer = Layer.succeed(InterviewRepository, {
    getForExport: () => Effect.succeed(data.sessions),
  });
  const protocolRepoLayer = Layer.succeed(ProtocolRepository, {
    getProtocols: () => Effect.succeed(data.protocols),
  });
  const { sink, getResult } = makeBlobSink();
  const outputLayer = makeZipOutput(sink);

  const program = Effect.gen(function* () {
    const queue = yield* Queue.unbounded<ExportEvent>();

    const drain = Effect.forkScoped(
      Stream.fromQueue(queue).pipe(
        Stream.runForEach((event) =>
          Effect.sync(() => {
            onEvent?.(event);
          }),
        ),
      ),
    );

    yield* drain;

    const result = yield* exportPipeline(
      data.sessions.map((session) => session.id),
      options,
      queue,
    );
    yield* Queue.shutdown(queue);
    return result;
  });

  const result = await Effect.runPromise(
    Effect.scoped(program).pipe(
      Effect.provide(
        Layer.mergeAll(interviewRepoLayer, protocolRepoLayer, outputLayer),
      ),
    ),
    { signal },
  );

  const sinkResult = getResult();
  return {
    result,
    blob: sinkResult?.blob ?? null,
    fileName: sinkResult?.fileName ?? null,
  };
}
