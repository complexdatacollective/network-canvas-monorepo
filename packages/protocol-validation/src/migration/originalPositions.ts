/**
 * Where each item of a list stood in the document a migration step was
 * given, so a refusal can name it where the researcher will find it.
 *
 * A step that repairs a protocol may shorten or reorder its lists before the
 * result is validated: duplicate option values are removed, stages are
 * added. A position read from the migrated document would then point at the
 * wrong item in the Architect that made the protocol. Items are objects the
 * step keeps (it filters and inserts, it does not copy), so each is recorded
 * by identity when the step starts and looked up when a refusal is described.
 * An item the step created has no position here.
 */
const positions = new WeakMap<object, number>();

const isObject = (value: unknown): value is object =>
  typeof value === 'object' && value !== null;

/** Records the position of every object in every list of `document`. */
export const recordOriginalPositions = (document: unknown): void => {
  const pending: unknown[] = [document];
  while (pending.length > 0) {
    const value = pending.pop();
    if (Array.isArray(value)) {
      value.forEach((item: unknown, index) => {
        if (isObject(item)) positions.set(item, index);
        pending.push(item);
      });
    } else if (isObject(value)) {
      pending.push(...Object.values(value));
    }
  }
};

/** The recorded position of `item`, or `undefined` when none was recorded. */
export const originalPositionOf = (item: unknown): number | undefined =>
  isObject(item) ? positions.get(item) : undefined;
