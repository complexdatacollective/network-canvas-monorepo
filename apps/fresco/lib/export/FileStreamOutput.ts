import { Effect, Layer } from 'effect';
import { OutputError as LegacyOutputError } from 'fresco-schema-8/network-exporters/errors';
import { Output as LegacyOutput } from 'fresco-schema-8/network-exporters/services/Output';

import { OutputError } from '@codaco/network-exporters/errors';
import { Output } from '@codaco/network-exporters/services/Output';
import { encodeExportEvent } from '~/lib/export/streamProtocol';

type OutputEntry = {
  readonly name: string;
  readonly data: AsyncIterable<Uint8Array>;
};

/**
 * Stream each export file as base64 SSE events (file-open → file-chunk* →
 * file-close) through the shared writer, instead of zipping. The browser
 * reassembles the files and builds one zip. Does NOT close the writer — the
 * route owns the writer lifecycle (complete/error frames).
 */
function writeEntryTo<E>(
  writer: WritableStreamDefaultWriter<Uint8Array>,
  toError: (cause: unknown) => E,
) {
  return (_handle: unknown, entry: OutputEntry) =>
    Effect.tryPromise({
      try: async () => {
        await writer.write(
          encodeExportEvent({ type: 'file-open', name: entry.name }),
        );
        for await (const chunk of entry.data) {
          const b64 = Buffer.from(chunk).toString('base64');
          await writer.write(encodeExportEvent({ type: 'file-chunk', b64 }));
        }
        await writer.write(encodeExportEvent({ type: 'file-close' }));
      },
      catch: toError,
    });
}

export const makeFileStreamOutputLayer = (
  writer: WritableStreamDefaultWriter<Uint8Array>,
): Layer.Layer<Output> =>
  Layer.succeed(Output, {
    begin: () => Effect.succeed({}),
    writeEntry: writeEntryTo(writer, (cause) => new OutputError({ cause })),
    end: () => Effect.succeed({}),
  });

/**
 * The same output for the schema 8 exporter, which writes schema 8 interviews
 * into the same stream.
 */
export const makeLegacyFileStreamOutputLayer = (
  writer: WritableStreamDefaultWriter<Uint8Array>,
): Layer.Layer<LegacyOutput> =>
  Layer.succeed(LegacyOutput, {
    begin: () => Effect.succeed({}),
    writeEntry: writeEntryTo(
      writer,
      (cause) => new LegacyOutputError({ cause }),
    ),
    end: () => Effect.succeed({}),
  });
