/**
 * Reads server-sent events from chunks of text that may split an event, or a
 * line, anywhere. Each complete event's `data:` lines, joined, are handed to
 * `onData`.
 */
export const createEventStreamParser = (onData: (data: string) => void) => {
  let buffer = '';
  let dataLines: string[] = [];

  const dispatch = () => {
    if (dataLines.length > 0) onData(dataLines.join('\n'));
    dataLines = [];
  };

  const line = (text: string) => {
    if (text === '') {
      dispatch();
      return;
    }
    if (text.startsWith(':')) return;
    const colon = text.indexOf(':');
    const field = colon === -1 ? text : text.slice(0, colon);
    let value = colon === -1 ? '' : text.slice(colon + 1);
    if (value.startsWith(' ')) value = value.slice(1);
    if (field === 'data') dataLines.push(value);
  };

  return {
    push(chunk: string) {
      buffer += chunk;
      // A trailing `\r` may be the first half of a `\r\n` still arriving, so
      // it waits with the unfinished line for the next chunk.
      const holdReturn = buffer.endsWith('\r');
      const lines = (holdReturn ? buffer.slice(0, -1) : buffer).split(
        /\r\n|\r|\n/u,
      );
      buffer = (lines.pop() ?? '') + (holdReturn ? '\r' : '');
      for (const text of lines) line(text);
    },
    /** The stream ended: an event without its closing blank line still counts. */
    end() {
      const rest = buffer.endsWith('\r') ? buffer.slice(0, -1) : buffer;
      if (rest !== '') line(rest);
      buffer = '';
      dispatch();
    },
  };
};

/**
 * Reads a response body as server-sent events, handing each event's data to
 * `onData` until the stream ends or `finished` says enough has been read.
 * Rejects when the read fails; an abort through `signal` ends the read
 * whatever the body is.
 */
export const readEventStream = async (
  body: ReadableStream<Uint8Array>,
  signal: AbortSignal,
  onData: (data: string) => void,
  finished: () => boolean = () => false,
): Promise<void> => {
  const parser = createEventStreamParser(onData);
  const reader = body.getReader();
  const decoder = new TextDecoder();
  const stopReading = () => {
    reader.cancel().catch(() => undefined);
  };
  signal.addEventListener('abort', stopReading, { once: true });
  try {
    for (;;) {
      // oxlint-disable-next-line no-await-in-loop -- a stream is read one chunk after another
      const { done, value } = await reader.read();
      if (done) break;
      parser.push(decoder.decode(value, { stream: true }));
      if (finished()) return;
    }
    parser.push(decoder.decode());
    parser.end();
  } finally {
    signal.removeEventListener('abort', stopReading);
    stopReading();
  }
};
