import { MAX_STAGE_ID_LENGTH } from './stages/base.ts';

/**
 * A stage id for a stage the migration adds: `stem` followed by `suffix` if
 * that is free, otherwise followed by the first free number as well. The stem
 * is shortened as needed so the id stays within the length schema 9 allows,
 * which an id built from a long schema 8 id could otherwise pass.
 * Deterministic, so migrating one document twice gives one result.
 */
export const freshStageId = (
  stem: string,
  suffix: string,
  taken: ReadonlySet<string>,
): string => {
  for (let count = 1; ; count += 1) {
    const tail = count === 1 ? suffix : `${suffix}-${count}`;
    const id = `${stem.slice(0, MAX_STAGE_ID_LENGTH - tail.length)}${tail}`;
    if (!taken.has(id)) return id;
  }
};
