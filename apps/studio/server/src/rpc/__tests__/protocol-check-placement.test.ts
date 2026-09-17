import { readFileSync, readdirSync } from 'node:fs';
import { dirname, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { describe, expect, it } from 'vitest';

// Where #1257's protocol-line check is allowed to happen (#1927 §10).
//
// The primary guarantee is not this test. `requireProtocol` requires the
// `Transaction` service, so the compiler refuses a call outside a transaction
// altogether — which is stronger than any source walk, because it also refuses
// a call in a transaction on some other connection. What a source walk adds is
// an inventory of the callers, so that a check placed in a transaction *of its
// own*, ahead of a command that opens a second one, is a line a reader has to
// write down rather than something that slips in unnoticed.
//
// The inventory below shrinks as each command converts. It never grows.

const SERVER_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '../../');

function typescriptFiles(root: string): string[] {
  return readdirSync(root, { withFileTypes: true }).flatMap((entry) => {
    const path = resolve(root, entry.name);
    if (entry.isDirectory()) {
      return entry.name === '__tests__' ? [] : typescriptFiles(path);
    }
    return entry.isFile() && path.endsWith('.ts') ? [path] : [];
  });
}

/** Every production file naming `name`, as repository-relative paths. */
function callersOf(name: string): string[] {
  const named = new RegExp(`\\b${name}\\b`);
  return typescriptFiles(SERVER_ROOT)
    .filter((file) => named.test(readFileSync(file, 'utf8')))
    .map((file) => relative(SERVER_ROOT, file))
    .toSorted();
}

describe('the protocol reachability check', () => {
  it('is reached only through requireProtocol and the editor host', () => {
    // `protocol/store.ts` declares it; `rpc/team-scope.ts` is `requireProtocol`,
    // the one wrapper the rpc plane calls it through; `protocol-builder`'s host
    // has its own gate, which §10 keeps because its inputs name a protocol and
    // never a team. Anything else asking the store this question directly is a
    // second answer to "may this caller reach this line", and #1257's rule then
    // has two places to drift between.
    expect(callersOf('isReachableByCaller')).toEqual([
      'protocol-builder/tenancy.ts',
      'protocol/store.ts',
      'rpc/team-scope.ts',
    ]);
  });

  it('runs in a transaction of its own for exactly the unconverted commands', () => {
    // A handler that opens `TenantScope` around `requireProtocol` and then runs
    // a Promise command is taking two transactions, so the check answers about
    // a snapshot the write does not share. That is today's behaviour and no
    // weaker than it was — but it is the TOCTOU §10 closes, so every file still
    // doing it is named here, and the list empties as the commands convert.
    const handlers = resolve(SERVER_ROOT, 'rpc/handlers');
    const separate = typescriptFiles(handlers).filter((file) =>
      /TenantScope\.open\(\s*access,\s*requireProtocol\(/.test(
        readFileSync(file, 'utf8'),
      ),
    );
    expect(separate.map((file) => relative(SERVER_ROOT, file))).toEqual([
      // `protocols.addInformationStage` and `protocols.moveStage`, whose
      // commands are still Promises that own their transactions.
      'rpc/handlers/protocols.ts',
    ]);
  });
});
