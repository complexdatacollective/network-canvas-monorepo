/**
 * A deterministic shuffle, so a fuzz over an axis product runs its cases in an
 * order no axis dictates and still runs the same order every time.
 *
 * Grouped cases hide interactions: every row of one axis value in a row means
 * the first failure is always the same axis, and a defect that needs an
 * unusual pairing is reported as whichever grouped batch happened to reach it.
 * A shuffle mixes them; a seed is what keeps the report reproducible — the
 * batch a failure names is the same batch on every machine and every run.
 */

/** Mulberry32: small, fast, and the same sequence everywhere. */
function randomFrom(seed: number): () => number {
  let state = seed >>> 0;
  return () => {
    state = (state + 0x6d_2b_79_f5) >>> 0;
    let drawn = state;
    drawn = Math.imul(drawn ^ (drawn >>> 15), drawn | 1);
    drawn ^= drawn + Math.imul(drawn ^ (drawn >>> 7), drawn | 61);
    return ((drawn ^ (drawn >>> 14)) >>> 0) / 4_294_967_296;
  };
}

/** Every combination of the given axes, in the order the axes are listed. */
export function crossProduct<T extends Record<string, readonly unknown[]>>(
  axes: T,
): readonly { [K in keyof T]: T[K][number] }[] {
  const names = Object.keys(axes);
  let rows: Record<string, unknown>[] = [{}];
  for (const name of names) {
    const values = axes[name] ?? [];
    rows = rows.flatMap((row) =>
      values.map((value) => ({ ...row, [name]: value })),
    );
  }
  // oxlint-disable-next-line typescript/no-unsafe-type-assertion
  return rows as readonly { [K in keyof T]: T[K][number] }[];
}

/** The given cases in a deterministic shuffled order. */
export function shuffled<T>(cases: readonly T[], seed: number): readonly T[] {
  const next = randomFrom(seed);
  const order = [...cases];
  for (let index = order.length - 1; index > 0; index -= 1) {
    const swap = Math.floor(next() * (index + 1));
    const held = order[index];
    const other = order[swap];
    if (held === undefined || other === undefined) continue;
    order[index] = other;
    order[swap] = held;
  }
  return order;
}

/**
 * The cases in batches, so one `it` covers a handful rather than one.
 *
 * A test per case names the failing case for free but buys hundreds of test
 * names; a batch keeps the report readable, and the case itself is named by
 * whatever the batch runner reports alongside the failure.
 */
export function batched<T>(
  cases: readonly T[],
  size: number,
): readonly Readonly<{ index: number; cases: readonly T[] }>[] {
  const batches: { index: number; cases: readonly T[] }[] = [];
  for (let start = 0; start < cases.length; start += size) {
    batches.push({
      index: batches.length + 1,
      cases: cases.slice(start, start + size),
    });
  }
  return batches;
}

/**
 * Runs one case and, if it fails, says which one — the whole point of a table
 * a person did not write out by hand.
 */
export async function runNamedCase<T>(
  subject: T,
  check: (subject: T) => Promise<void>,
): Promise<void> {
  try {
    await check(subject);
  } catch (failure: unknown) {
    const described = JSON.stringify(subject);
    if (failure instanceof Error) {
      failure.message = `case ${described}\n${failure.message}`;
      throw failure;
    }
    throw new Error(`case ${described}: ${String(failure)}`, {
      cause: failure,
    });
  }
}
