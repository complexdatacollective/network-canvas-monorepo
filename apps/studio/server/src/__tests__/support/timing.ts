/**
 * Fails a case that would otherwise hang, at a bound it chooses rather than at
 * the suite's timeout. A shutdown that waits on an event which never comes is
 * indistinguishable from a slow one until something says how long is too long,
 * and "the file timed out" names neither the call nor the reason.
 */
export async function settlesWithin<T>(
  work: Promise<T>,
  ms: number,
  what: string,
): Promise<T> {
  let timer: NodeJS.Timeout | undefined;
  try {
    return await Promise.race([
      work,
      new Promise<never>((_, failed) => {
        timer = setTimeout(
          () => failed(new Error(`${what} did not settle within ${ms}ms`)),
          ms,
        );
      }),
    ]);
  } finally {
    clearTimeout(timer);
  }
}
