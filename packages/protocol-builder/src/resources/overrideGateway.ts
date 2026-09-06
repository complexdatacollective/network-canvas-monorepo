import type { ProtocolBuilderResourceGateway } from './gateway.ts';

/**
 * A host gateway with the one or two methods a caller is about replaced, so a
 * call can be held open, answered late, answered twice, or answered with
 * something the double itself cannot say.
 *
 * Beside {@link InMemoryResourceGateway} rather than in a test folder because
 * both callers need it: a test holding a call open across an interleaving, and
 * a story showing a state the in-memory host has no honest way to reach — a
 * host that keeps a promoted key itself, for one, which the in-memory
 * double cannot claim to be because its own promotion writes the value into
 * the protocol.
 *
 * Every method is forwarded explicitly rather than spread from `inner`: the
 * gateway is usually a class instance, and its methods live on the prototype
 * where a spread would not find them.
 */
export function overrideGateway(
  inner: ProtocolBuilderResourceGateway,
  overrides: Partial<ProtocolBuilderResourceGateway>,
): ProtocolBuilderResourceGateway {
  return {
    secretStorage: inner.secretStorage,
    list: (options) => inner.list(options),
    stageUpload: (request) => inner.stageUpload(request),
    stageSecret: (request) => inner.stageSecret(request),
    resolvePreview: (resourceId) => inner.resolvePreview(resourceId),
    inspect: (resourceId) => inner.inspect(resourceId),
    download: (resourceId) => inner.download(resourceId),
    discardStaged: (resourceId) => inner.discardStaged(resourceId),
    discardAllStaged: () => inner.discardAllStaged(),
    promote: (request) => inner.promote(request),
    ...overrides,
  };
}
