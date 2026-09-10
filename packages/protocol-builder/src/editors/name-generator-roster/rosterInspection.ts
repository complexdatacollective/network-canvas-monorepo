import type { ProtocolBuilderClient } from '../../contract/contract.ts';
import type { InMemoryHost } from '../../testing/host/createInMemoryHost.ts';
import { withResourceProcedures } from '../../testing/withResourceProcedures.ts';

/**
 * What a host that had read the roster answers about it.
 *
 * A roster's card, sort and search sections are all chosen from the columns
 * of an imported data file, and the columns come from the FILE rather than
 * from the codebook — so the gateway's `inspect` is the only thing that knows
 * them. A real host reads the bytes it stores and reports them; the in-memory
 * host every test and story mounts answers with the manifest entry alone, so
 * without this every roster section would render its "nothing to choose"
 * state and prove nothing about itself.
 *
 * Stated rather than parsed, and stated once: this is what
 * `packages/protocols/e2e/all-interfaces/assets/roster.json` holds, and a
 * fixture that gains a column changes one line here. The same shape
 * `AssetPickerField.test.tsx` already uses for the picker's own summary.
 */
const ROSTER_COLUMNS = ['age', 'name'] as const;
const ROSTER_COUNTS = { nodes: 3, edges: 0 } as const;

/**
 * The host's client, answering about a network file the way a host that had
 * read one does.
 *
 * Only `inspect` is answered for, and only for a `network` resource: every
 * other procedure is the real host's, so a stage saved through this client is
 * still a stage the protocol schema accepted.
 */
export function withRosterColumns(host: InMemoryHost): ProtocolBuilderClient {
  const { client } = host;
  return withResourceProcedures(client, {
    inspect: async (input) => {
      const inspected = await client.resources.inspect(input);
      if (
        inspected.status !== 'ok' ||
        inspected.data.descriptor.kind !== 'network'
      ) {
        return inspected;
      }
      return {
        status: 'ok' as const,
        data: {
          ...inspected.data,
          counts: ROSTER_COUNTS,
          variableNames: [...ROSTER_COLUMNS],
        },
      };
    },
  });
}
