import { getProtocolFileErrorKind } from './protocolFileErrorKind.ts';

/** How far down a `cause` chain the copy follows. */
const MAX_CAUSE_DEPTH = 5;

/** Stack lines that name a frame: V8's `    at …`, and SpiderMonkey and JavaScriptCore's `fn@url:line:col`. */
const FRAME_LINE = /^\s+at |@.*:\d+:\d+$/;

/** A V8 frame line. V8 also writes the message at the head of the stack. */
const V8_FRAME = /^\s+at /m;

/**
 * The frames of an error's stack, without its message.
 *
 * V8 writes the message into the stack verbatim, so a message that spans
 * lines can carry a line shaped like a frame. Everything up to the end of the
 * message is dropped before frames are picked out, and when a V8 stack no
 * longer contains the message (it was changed after the error was made), no
 * frame can be told apart from it, so none is kept. SpiderMonkey and
 * JavaScriptCore stacks hold only frames.
 */
function stackFrames(error: Error): string[] {
  const { stack, message } = error;
  if (typeof stack !== 'string') return [];

  let body = stack;
  if (message !== '') {
    const at = stack.indexOf(message);
    if (at !== -1) body = stack.slice(at + message.length);
    else if (V8_FRAME.test(stack)) return [];
  }
  return body.split('\n').filter((line) => FRAME_LINE.test(line));
}

/**
 * A copy of an error that failed to open or upgrade a protocol, safe to send
 * to exception tracking.
 *
 * The messages these errors carry describe the protocol itself: schema
 * validation quotes its paths, which are the researcher's own variable and
 * stage identifiers, and sometimes the values found there, and a host's own
 * wrapper may name the protocol. None of that may leave the deployment. The
 * copy keeps what finds the bug and nothing about the protocol: the error's
 * `name` (which is how exception tracking groups it), a fixed message naming
 * its kind, the stack frames without the message line, and the same for each
 * error in its `cause` chain.
 */
export function toReportableProtocolError(error: unknown, depth = 0): Error {
  const kind = getProtocolFileErrorKind(error);
  const name = error instanceof Error ? error.name : 'Error';
  const message = `Protocol could not be opened or upgraded (${kind ?? 'unclassified'}).`;

  const cause =
    error instanceof Error &&
    error.cause !== undefined &&
    depth < MAX_CAUSE_DEPTH
      ? toReportableProtocolError(error.cause, depth + 1)
      : undefined;
  const reportable = new Error(message, cause ? { cause } : undefined);
  reportable.name = name;

  const frames = error instanceof Error ? stackFrames(error) : [];
  reportable.stack = [`${name}: ${message}`, ...frames].join('\n');

  return reportable;
}
