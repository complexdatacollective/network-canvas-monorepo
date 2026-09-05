import {
  resourceFailure,
  type ProtocolBuilderResourceGateway,
  type ResourceResult,
} from './gateway.ts';

/**
 * What an adapter that throws rather than reporting is turned into.
 *
 * The port says failures arrive as results, so a throw is the adapter breaking
 * its own contract — and the researcher still has to be told something true,
 * in their own terms, rather than being shown a host's exception or nothing at
 * all.
 */
const UNREACHABLE_MESSAGE =
  'The resource could not be reached. Try again in a moment.';

/**
 * Runs one gateway call so that its answer is always a result.
 *
 * `operation().catch(…)` is not this: a gateway method that throws
 * *synchronously* throws before the promise it was supposed to return exists,
 * so the `catch` is never reached and the exception escapes into whatever
 * called it — a `void`-ed promise nobody observes, a control left waiting for
 * an answer that will never come, a committed save reported as a failure. The
 * call therefore happens inside the `try`, not before it.
 *
 * Both shapes are treated identically on purpose: from here, a host that
 * throws and a host that rejects are the same broken promise, and neither is
 * something the researcher can be told anything more specific about.
 */
export async function callGateway<T>(
  operation: () => Promise<ResourceResult<T>>,
): Promise<ResourceResult<T>> {
  try {
    return await operation();
  } catch {
    return resourceFailure<T>('unavailable', UNREACHABLE_MESSAGE, {
      retryable: true,
    });
  }
}

/**
 * A host's gateway with every method answering on the result channel.
 *
 * Applied once, where the host's adapter enters the package, so nothing inside
 * has to defend against an adapter that throws: the session's own gateway —
 * the one editors are handed and the one a finish promotes through — is this
 * one. Each method is forwarded explicitly rather than spread, because an
 * adapter is usually a class instance whose methods live on the prototype.
 */
export function resultChannelGateway(
  host: ProtocolBuilderResourceGateway,
): ProtocolBuilderResourceGateway {
  return {
    list: (options) => callGateway(() => host.list(options)),
    stageUpload: (request) => callGateway(() => host.stageUpload(request)),
    stageSecret: (request) => callGateway(() => host.stageSecret(request)),
    resolvePreview: (resourceId) =>
      callGateway(() => host.resolvePreview(resourceId)),
    inspect: (resourceId) => callGateway(() => host.inspect(resourceId)),
    download: (resourceId) => callGateway(() => host.download(resourceId)),
    discardStaged: (resourceId) =>
      callGateway(() => host.discardStaged(resourceId)),
    discardAllStaged: () => callGateway(() => host.discardAllStaged()),
    promote: (request) => callGateway(() => host.promote(request)),
  };
}
