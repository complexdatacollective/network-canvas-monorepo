const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

const stagesOf = (protocol: unknown): { id?: string; type?: string }[] =>
  isRecord(protocol) && Array.isArray(protocol.stages)
    ? protocol.stages.map((stage) =>
        isRecord(stage)
          ? {
              id: typeof stage.id === 'string' ? stage.id : undefined,
              type: typeof stage.type === 'string' ? stage.type : undefined,
            }
          : {},
      )
    : [];

/**
 * Each schema 8 stage id of `document`, mapped to the id `migrated`, a schema
 * 9 migration of `document`, gave the first stage that had it, as stage
 * references follow. The migration's ids are random, so a stage is found by
 * its type and order: the migration keeps every stage and its type, and only
 * adds stages (an Information stage before the stage whose introduction it
 * shows, and the finish stage at the end), so each stage is the next one of
 * its type after the stage before it.
 */
export const migratedStageIds = (
  document: unknown,
  migrated: unknown,
): Map<string, string> => {
  const after = stagesOf(migrated);
  const result = new Map<string, string>();
  let next = 0;
  for (const { id, type } of stagesOf(document)) {
    const index = after.findIndex(
      (stage, position) => position >= next && stage.type === type,
    );
    if (index === -1) break;
    next = index + 1;
    const newId = after[index]?.id;
    if (id !== undefined && newId !== undefined && !result.has(id)) {
      result.set(id, newId);
    }
  }
  return result;
};

/** The id `migrated` gave the schema 8 stage of `document` whose id was `id`. */
export const migratedStageId = (
  document: unknown,
  migrated: unknown,
  id: unknown,
): string | undefined =>
  typeof id === 'string'
    ? migratedStageIds(document, migrated).get(id)
    : undefined;
