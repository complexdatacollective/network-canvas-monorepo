import { Effect } from 'effect';
import type * as Rpc from 'effect/unstable/rpc/Rpc';
import * as RpcClient from 'effect/unstable/rpc/RpcClient';
import type * as RpcGroup from 'effect/unstable/rpc/RpcGroup';
import * as RpcServer from 'effect/unstable/rpc/RpcServer';

/**
 * A client wired straight to the group's handlers: no transport and no
 * serialization, so typed errors and stream chunks arrive as the handlers made
 * them. `RpcTest.makeClient` composes the same two public constructors; it is
 * not depended on because Effect ships it as a test harness.
 *
 * `disableFatalDefects` keeps a handler's defect on its own call. Without it
 * the server reports the defect to the whole connection, and the client fails
 * every call in flight with it — the protocol's event stream included.
 *
 * A payload failing its schema is a defect here, not a typed failure: the
 * client checks it before anything is sent.
 */
export const makeInProcessClient = Effect.fnUntraced(function* <
  Rpcs extends Rpc.Any,
>(group: RpcGroup.RpcGroup<Rpcs>) {
  // oxlint-disable-next-line prefer-const
  let client!: Effect.Success<
    ReturnType<typeof RpcClient.makeNoSerialization<Rpcs, never, true>>
  >;
  const server = yield* RpcServer.makeNoSerialization(group, {
    onFromServer: (response) => client.write(response),
    disableFatalDefects: true,
  });
  client = yield* RpcClient.makeNoSerialization(group, {
    supportsAck: true,
    flatten: true,
    onFromClient: ({ message }) => server.write(0, message),
  });
  return client.client;
});
