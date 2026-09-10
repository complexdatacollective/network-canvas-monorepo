import type { ProtocolBuilderClient } from '../contract/contract.ts';

/**
 * The same host, with some of its resource procedures answered differently.
 *
 * Every override answers the contract: a host that refuses to stage, one that
 * takes its time, one that reads more out of a file than the in-memory store
 * does. Nothing here is a control being told what to do — the editor calls the
 * same procedures either way and cannot tell which host it is talking to.
 *
 * Beside the harness rather than inside a `__tests__` directory, because it is
 * what `renderStageEditor`'s and `StageEditorStoryHost`'s `client` option is
 * given, and a story reaching into `__tests__` would put test scaffolding in
 * the Storybook build.
 */
export function withResourceProcedures(
  client: ProtocolBuilderClient,
  overrides: Partial<ProtocolBuilderClient['resources']>,
): ProtocolBuilderClient {
  // Proxied rather than spread: a contract client's procedures are reached
  // through property access rather than held as own properties, so a spread
  // copy of one has no procedures on it at all.
  const overridden = new Map<PropertyKey, unknown>(Object.entries(overrides));
  const resources = new Proxy(client.resources, {
    get: (target, property, receiver) =>
      overridden.get(property) ?? Reflect.get(target, property, receiver),
  });
  return new Proxy(client, {
    get: (target, property, receiver) =>
      property === 'resources'
        ? resources
        : Reflect.get(target, property, receiver),
  });
}
