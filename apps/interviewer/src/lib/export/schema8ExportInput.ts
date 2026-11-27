import type { ProtocolExportInput } from '@codaco/network-exporters/input';

import type { StoredSchema8Protocol } from '../db/types';

type EntityDefinition = { variables?: Record<string, unknown> };

const isLayoutVariable = (variable: unknown) =>
  typeof variable === 'object' &&
  variable !== null &&
  'type' in variable &&
  variable.type === 'layout';

const layoutName = (id: string, variable: unknown) =>
  typeof variable === 'object' &&
  variable !== null &&
  'name' in variable &&
  typeof variable.name === 'string'
    ? variable.name
    : id;

const withoutLayoutVariables = (
  definition: EntityDefinition,
  onLayout: (id: string, variable: unknown) => void = () => undefined,
): EntityDefinition => {
  if (definition.variables === undefined) return definition;
  const variables = Object.fromEntries(
    Object.entries(definition.variables).filter(([id, variable]) => {
      if (!isLayoutVariable(variable)) return true;
      onLayout(id, variable);
      return false;
    }),
  );
  return { ...definition, variables };
};

const mapTypes = (
  types: Record<string, EntityDefinition> | null | undefined,
  map: (type: string, definition: EntityDefinition) => EntityDefinition,
) =>
  types === undefined || types === null
    ? undefined
    : Object.fromEntries(
        Object.entries(types).map(([type, definition]) => [
          type,
          map(type, definition),
        ]),
      );

/**
 * The export input of a schema 8 protocol. It is exported as it was
 * collected, never converted to schema 9: the exporter reads only what the two
 * schemas share (entity types, variable names, types and options), and its own
 * handling of each variable type covers schema 8's. The one difference it
 * cannot read is a layout: schema 8 declared one as a variable of type
 * `layout`. A node layout variable is handed over as a layout of the codebook,
 * held by the node types that declared it, so its position columns stay in
 * the export. An ego or edge one is dropped, as the schema 9 migration drops
 * it: no stage could place ego or an edge.
 */
export function schema8ExportInput(
  protocol: StoredSchema8Protocol,
): ProtocolExportInput {
  const layouts: Record<string, { name: string }> = {};
  const layoutNodeTypes: Record<string, string[]> = {};
  const { codebook } = protocol;
  const node = mapTypes(codebook.node, (type, definition) =>
    withoutLayoutVariables(definition, (id, variable) => {
      layouts[id] ??= { name: layoutName(id, variable) };
      (layoutNodeTypes[id] ??= []).push(type);
    }),
  );
  const edge = mapTypes(codebook.edge, (_type, definition) =>
    withoutLayoutVariables(definition),
  );
  const ego =
    codebook.ego === undefined || codebook.ego === null
      ? undefined
      : withoutLayoutVariables(codebook.ego);
  const converted: unknown = {
    ...codebook,
    ...(node === undefined ? {} : { node }),
    ...(edge === undefined ? {} : { edge }),
    ...(ego === undefined ? {} : { ego }),
    ...(Object.keys(layouts).length === 0 ? {} : { layouts }),
  };
  return {
    hash: protocol.hash,
    name: protocol.name,
    // oxlint-disable-next-line typescript/no-unsafe-type-assertion -- the schema 8 and current codebook types differ only in fields the exporter never reads, once layout variables are moved to layouts or dropped
    codebook: converted as ProtocolExportInput['codebook'],
    layoutNodeTypes,
  };
}
