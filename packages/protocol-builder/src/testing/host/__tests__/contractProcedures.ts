import { getProcedureContractOrThrow } from '@orpc/contract';

import { contract } from '@codaco/protocol-builder-core/contract';

/** Every procedure in the contract, as dotted paths. */
export function procedurePaths(
  router: object = contract,
  prefix: string[] = [],
): string[] {
  const paths: string[] = [];
  for (const [key, value] of Object.entries(router)) {
    const path = [...prefix, key];
    if (isProcedure(path)) {
      paths.push(path.join('.'));
      continue;
    }
    if (typeof value === 'object' && value !== null) {
      paths.push(...procedurePaths(value, path));
    }
  }
  return paths;
}

/**
 * The procedures whose input carries an idempotency key, read off the contract
 * rather than listed: a procedure that gains one and is not enumerated against
 * a retry escapes the check entirely.
 */
export function keyedProcedures(): string[] {
  return procedurePaths().filter((path) =>
    inputKeys(path).includes('requestId'),
  );
}

function inputKeys(path: string): string[] {
  const procedure = getProcedureContractOrThrow(contract, path.split('.')) as {
    ['~orpc']: { inputSchemas?: readonly unknown[] };
  };
  return (procedure['~orpc'].inputSchemas ?? []).flatMap((schema) => {
    const shape = (schema as { def?: { shape?: Record<string, unknown> } }).def
      ?.shape;
    return shape === undefined ? [] : Object.keys(shape);
  });
}

function isProcedure(path: readonly string[]): boolean {
  try {
    getProcedureContractOrThrow(contract, path);
    return true;
  } catch {
    return false;
  }
}
