import { Effect } from 'effect';
import type * as Rpc from 'effect/rpc/Rpc';
import * as RpcClient from 'effect/rpc/RpcClient';
import type * as RpcGroup from 'effect/rpc/RpcGroup';
import * as RpcServer from 'effect/rpc/RpcServer';

/**
 * `disableFatalDefects` keeps a handler's defect on its own call. Without it
 * the client fails every call in flight with it.
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
