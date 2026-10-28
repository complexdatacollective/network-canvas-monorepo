import { flatMap, get, reduce } from 'es-toolkit/compat';

import {
  collectEntityAttributeReferences,
  type LocalizedString,
} from '@codaco/protocol-validation';

type VariableConfiguration = {
  name: string;
  type: string;
  component?: string;
  [key: string]: unknown;
};

type Field = {
  variable: string;
  prompt?: LocalizedString;
  [key: string]: unknown;
};

const buildVariableEntry =
  (
    protocol: { stages?: Array<{ id: string; [key: string]: unknown }> },
    variablePaths: Record<string, unknown>,
    fields: Field[],
    entity: string,
    entityType: string,
  ) =>
  (variableConfiguration: VariableConfiguration, variableId: string) => {
    const usage = reduce<Record<string, unknown>, string[]>(
      variablePaths,
      (memo, id, variablePath) => {
        if (id !== variableId) {
          return memo;
        }
        return [...memo, variablePath];
      },
      [],
    );

    // De-duplicated: one stage commonly reads one variable through several
    // tagged sites (a prompt's `variable` and its own sort key; a roster
    // naming the same column in `cardOptions` and `searchOptions`), and the
    // Summary renders one link per entry, keyed by stage id. Repeating the
    // link tells the researcher nothing extra and makes the keys collide.
    // `usage` below keeps every distinct path — that index is read by path.
    const stages = [
      ...new Set(
        usage
          .map((path: string) => {
            // Keys are in dotted-array format: e.g. "stages.0.form.fields.0.variable"
            const segments = path.split('.');
            if (segments[0] !== 'stages' || segments[1] === undefined) {
              return undefined;
            }
            return get(protocol, `stages.${segments[1]}.id`) as
              | string
              | undefined;
          })
          .filter((id): id is string => id !== undefined),
      ),
    ];

    const field = fields.find((f) => f.variable === variableId);

    return {
      id: variableId,
      name: variableConfiguration.name,
      type: variableConfiguration.type,
      component: variableConfiguration.component,
      prompt: field?.prompt,
      subject: { entity, type: entityType !== 'ego' && entityType },
      stages,
      usage,
    };
  };

type Protocol = {
  stages?: Array<{
    id: string;
    form?: {
      fields: Field[];
    };
    [key: string]: unknown;
  }>;
  codebook?: {
    node?: Record<
      string,
      { variables?: Record<string, VariableConfiguration> }
    >;
    edge?: Record<
      string,
      { variables?: Record<string, VariableConfiguration> }
    >;
    ego?: { variables?: Record<string, VariableConfiguration> };
  };
};

export const getCodebookIndex = (protocol: Protocol | null | undefined) => {
  if (!protocol?.stages || !protocol.codebook) {
    return [];
  }

  const hits = collectEntityAttributeReferences(protocol);
  const variablePaths: Record<string, unknown> = {};
  for (const hit of hits) {
    variablePaths[hit.path.join('.')] = hit.variableId;
  }

  const fields = flatMap(protocol.stages, (stage) => {
    if (!stage.form) {
      return [];
    }

    return stage.form.fields;
  });

  const protocolEntities: Array<'node' | 'edge' | 'ego'> = [
    ...(protocol.codebook?.node ? (['node'] as const) : []),
    ...(protocol.codebook?.edge ? (['edge'] as const) : []),
    ...(protocol.codebook?.ego ? (['ego'] as const) : []),
  ];

  const index = flatMap(protocolEntities, (entity) => {
    const codebook = protocol.codebook;
    if (!codebook) {
      return [];
    }

    const entityConfigurations =
      entity === 'ego' ? { ego: codebook.ego } : codebook[entity];

    return flatMap(entityConfigurations, (entityConfiguration, entityType) =>
      flatMap(
        entityConfiguration?.variables,
        buildVariableEntry(protocol, variablePaths, fields, entity, entityType),
      ),
    );
  });

  return index;
};
