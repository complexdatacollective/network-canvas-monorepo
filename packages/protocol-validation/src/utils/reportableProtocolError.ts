import { getProtocolFileErrorKind } from './protocolFileErrorKind.ts';

/** How far down a `cause` chain the copy follows. */
const MAX_CAUSE_DEPTH = 5;

/** Stack lines that name a frame: V8's `    at …`, and SpiderMonkey and JavaScriptCore's `fn@url:line:col`. */
const FRAME_LINE = /^\s+at |@.*:\d+:\d+$/;

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

  const frames =
    error instanceof Error && typeof error.stack === 'string'
      ? error.stack.split('\n').filter((line) => FRAME_LINE.test(line))
      : [];
  reportable.stack = [`${name}: ${message}`, ...frames].join('\n');

  return reportable;
}
