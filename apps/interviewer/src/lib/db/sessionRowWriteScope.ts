import Dexie, { type DBCore, type Middleware } from 'dexie';

// Interviewer 8 inside Interviewer 9 (a /v8/ build) shares Interviewer 9's
// database, `interviewer`, which Interviewer 9 owns: it lists, starts, imports,
// exports and deletes, and runs every upgrade. The /v8/ page runs one
// interview, and the only row it may write is that interview's own session:
// its answers, its step and its finish. No settings, no protocols or assets,
// no other session, and nothing deleted.
//
// The code a /v8/ build reaches already keeps to that. This middleware makes
// it a property of the connection, so a write anything else attempts fails
// rather than reaching Interviewer 9's data.

const refusal = (what: string) =>
  new Dexie.ReadOnlyError(
    `Interviewer 8 inside Interviewer 9 writes only its interview's session row; refused ${what}.`,
  );

const isObject = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null;

/**
 * Allow writes only as `put`s of the `sessions` row `sessionId`. With a null
 * `sessionId` (the page was not opened for an interview) nothing is writable.
 */
export const sessionRowWriteScope = (
  sessionId: string | null,
): Middleware<DBCore> => ({
  stack: 'dbcore',
  name: 'interviewer8SessionRowWriteScope',
  create: (down) => ({
    ...down,
    transaction: (stores, mode, options) => {
      if (mode === 'readwrite' && stores.some((name) => name !== 'sessions')) {
        throw refusal(`a read-write transaction on ${stores.join(', ')}`);
      }
      return down.transaction(stores, mode, options);
    },
    table: (tableName) => {
      const table = down.table(tableName);
      return {
        ...table,
        mutate: (request) => {
          const allowed =
            tableName === 'sessions' &&
            request.type === 'put' &&
            sessionId !== null &&
            request.values.every(
              (row) => isObject(row) && row.id === sessionId,
            );
          if (!allowed) {
            return Promise.reject(refusal(`a ${request.type} on ${tableName}`));
          }
          return table.mutate(request);
        },
      };
    },
  }),
});
