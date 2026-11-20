import ProtocolSchemaV8 from '../../8/schema.ts';
import migrationV8toV9 from '../migration.ts';

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

const stageIdsOf = (protocol: unknown): (string | undefined)[] =>
  isRecord(protocol) && Array.isArray(protocol.stages)
    ? protocol.stages.map((stage) =>
        isRecord(stage) && typeof stage.id === 'string' ? stage.id : undefined,
      )
    : [];

/**
 * Each schema 8 stage id of `document`, mapped to the id `migrated`, a schema
 * 9 migration of `document`, gave the first stage that had it, as stage
 * references follow. The migration's ids are random, so a stage is found by
 * its position, which every migration of `document` puts in the same place:
 * a separate run of the step reports where each one went.
 */
export const migratedStageIds = (
  document: unknown,
  migrated: unknown,
): Map<string, string> => {
  const input = ProtocolSchemaV8.parse(document);
  const traced = stageIdsOf(migrationV8toV9.migrate(input, {}));
  const ids = stageIdsOf(migrated);
  const result = new Map<string, string>();
  for (const [oldId, newId] of migrationV8toV9.stageIdChanges?.(input) ?? []) {
    const id = ids[traced.indexOf(newId)];
    if (id !== undefined) result.set(oldId, id);
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
