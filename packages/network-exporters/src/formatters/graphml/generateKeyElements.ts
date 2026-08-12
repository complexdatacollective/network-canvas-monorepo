import { DOMImplementation, type DocumentFragment } from '@xmldom/xmldom';

import type { Codebook, Variable } from '@codaco/protocol-validation';
import {
  type NcEgo,
  ncSourceUUID,
  ncTargetUUID,
  ncTypeProperty,
  ncUUIDProperty,
} from '@codaco/shared-consts';

import type { EdgeWithResequencedID, NodeWithResequencedID } from '../../input';
import type { ExportOptions } from '../../options';
import { getEntityAttributes } from '../../utils/general';
import { createDocumentFragment, getGraphMLTypeForKey, sha1 } from './helpers';

type GraphMLEntityKind = 'ego' | 'node' | 'edge';
type GraphMLKeyTarget = 'graph' | 'node' | 'edge' | 'all';

type GraphMLEntitiesByKind = {
  ego: readonly NcEgo[];
  node: readonly NodeWithResequencedID[];
  edge: readonly EdgeWithResequencedID[];
};

type GraphMLEntity = GraphMLEntitiesByKind[GraphMLEntityKind][number];

type GraphMLKey = {
  id: string;
  name: string;
  type: string;
  target: GraphMLKeyTarget;
};

type GeneratedGraphMLKeys = {
  fragment: DocumentFragment;
  externalKeyIds: ReadonlyMap<string, string>;
};

const getDeclaredVariables = (
  entityKind: GraphMLEntityKind,
  codebook: Codebook,
): [string, Variable][] => {
  if (entityKind === 'ego') {
    return Object.entries(codebook.ego?.variables ?? {});
  }

  return Object.values(codebook[entityKind] ?? {}).flatMap((definition) =>
    Object.entries(definition.variables ?? {}),
  );
};

const getCodebookVariables = (
  entityKind: GraphMLEntityKind,
  entity: GraphMLEntity,
  codebook: Codebook,
): Record<string, Variable> => {
  if (entityKind === 'ego') {
    return codebook.ego?.variables ?? {};
  }

  if (!('type' in entity) || typeof entity.type !== 'string') {
    return {};
  }

  return codebook[entityKind]?.[entity.type]?.variables ?? {};
};

const mergeTargets = (
  existing: GraphMLKeyTarget,
  incoming: GraphMLKeyTarget,
): GraphMLKeyTarget => (existing === incoming ? existing : 'all');

const getGraphMLTypeForDeclaredVariable = (
  entities: readonly GraphMLEntity[],
  variableId: string,
  fallbackType: 'double' | 'int' | 'string',
) =>
  entities.some(
    (entity) => getEntityAttributes(entity)[variableId] !== undefined,
  )
    ? getGraphMLTypeForKey(entities, variableId)
    : fallbackType;

export default function getKeyElementGenerator(
  codebook: Codebook,
  exportOptions: ExportOptions,
) {
  return async (
    entitiesByKind: GraphMLEntitiesByKind,
  ): Promise<GeneratedGraphMLKeys> => {
    const keys = new Map<string, GraphMLKey>();
    const reservedKeyIds = new Set<string>();

    const addKey = (key: GraphMLKey) => {
      const existing = keys.get(key.id);
      if (existing) {
        existing.target = mergeTargets(existing.target, key.target);
        return;
      }

      keys.set(key.id, key);
      reservedKeyIds.add(key.id);
    };

    addKey({ id: 'label', name: 'label', type: 'string', target: 'all' });
    addKey({
      id: ncTypeProperty,
      name: ncTypeProperty,
      type: 'string',
      target: 'all',
    });
    addKey({
      id: ncUUIDProperty,
      name: ncUUIDProperty,
      type: 'string',
      target: 'all',
    });
    addKey({
      id: ncTargetUUID,
      name: ncTargetUUID,
      type: 'string',
      target: 'edge',
    });
    addKey({
      id: ncSourceUUID,
      name: ncSourceUUID,
      type: 'string',
      target: 'edge',
    });

    const addVariableKeys = async (
      entityKind: GraphMLEntityKind,
      variableId: string,
      variable: Variable,
    ) => {
      const keyName = variable.name;
      const keyTarget = entityKind === 'ego' ? 'graph' : entityKind;
      const entities = entitiesByKind[entityKind];

      switch (variable.type) {
        case 'boolean':
          addKey({
            id: variableId,
            name: keyName,
            type: 'boolean',
            target: keyTarget,
          });
          break;
        case 'ordinal':
          addKey({
            id: variableId,
            name: keyName,
            type: getGraphMLTypeForDeclaredVariable(
              entities,
              variableId,
              variable.options.length > 0 &&
                variable.options.every(
                  (option) => typeof option.value === 'number',
                )
                ? 'int'
                : 'string',
            ),
            target: keyTarget,
          });
          break;
        case 'number':
          addKey({
            id: variableId,
            name: keyName,
            type: getGraphMLTypeForDeclaredVariable(
              entities,
              variableId,
              'double',
            ),
            target: keyTarget,
          });
          break;
        case 'layout':
          addKey({
            id: `${variableId}_X`,
            name: `${keyName}_X`,
            type: 'double',
            target: keyTarget,
          });
          if (exportOptions.globalOptions.useScreenLayoutCoordinates) {
            addKey({
              id: `${variableId}_screenSpaceY`,
              name: `${keyName}_screenSpaceY`,
              type: 'double',
              target: keyTarget,
            });
            addKey({
              id: `${variableId}_screenSpaceX`,
              name: `${keyName}_screenSpaceX`,
              type: 'double',
              target: keyTarget,
            });
          }
          addKey({
            id: `${variableId}_Y`,
            name: `${keyName}_Y`,
            type: 'double',
            target: keyTarget,
          });
          break;
        case 'categorical': {
          const hashedOptionValues = await Promise.all(
            variable.options.map((option) => sha1(String(option.value))),
          );
          variable.options.forEach((option, index) => {
            const hashedOptionValue = hashedOptionValues[index];
            if (hashedOptionValue) {
              addKey({
                id: `${variableId}_${hashedOptionValue}`,
                name: `${keyName}_${option.value}`,
                type: 'boolean',
                target: keyTarget,
              });
            }
          });
          break;
        }
        case 'scalar':
          addKey({
            id: variableId,
            name: keyName,
            type: 'float',
            target: keyTarget,
          });
          break;
        default:
          addKey({
            id: variableId,
            name: keyName,
            type: 'string',
            target: keyTarget,
          });
      }
    };

    const entityKinds: GraphMLEntityKind[] = ['ego', 'node', 'edge'];
    for (const entityKind of entityKinds) {
      for (const [variableId, variable] of getDeclaredVariables(
        entityKind,
        codebook,
      )) {
        await addVariableKeys(entityKind, variableId, variable);
      }
    }

    const externalTargets = new Map<string, Set<GraphMLKeyTarget>>();
    for (const entityKind of entityKinds) {
      const keyTarget = entityKind === 'ego' ? 'graph' : entityKind;
      for (const entity of entitiesByKind[entityKind]) {
        const codebookVariables = getCodebookVariables(
          entityKind,
          entity,
          codebook,
        );

        for (const variableId of Object.keys(getEntityAttributes(entity))) {
          if (codebookVariables[variableId]) {
            continue;
          }

          const targets = externalTargets.get(variableId);
          if (targets) {
            targets.add(keyTarget);
          } else {
            externalTargets.set(variableId, new Set([keyTarget]));
          }
        }
      }
    }

    const externalKeyIds = new Map<string, string>();
    for (const variableId of [...externalTargets.keys()].toSorted()) {
      let keyId: string | undefined;
      const maximumAttempts = reservedKeyIds.size + 1;
      for (let attempt = 0; attempt < maximumAttempts; attempt += 1) {
        const candidate = await sha1(
          attempt === 0 ? variableId : `external:${attempt}:${variableId}`,
        );
        if (!reservedKeyIds.has(candidate)) {
          keyId = candidate;
          break;
        }
      }
      if (!keyId) {
        throw new Error(
          `Could not generate a unique GraphML key for external attribute: ${variableId}`,
        );
      }

      const targets = externalTargets.get(variableId);
      if (!targets || targets.size === 0) {
        continue;
      }

      const [onlyTarget] = targets;
      const target: GraphMLKeyTarget =
        targets.size === 1 && onlyTarget ? onlyTarget : 'all';

      addKey({
        id: keyId,
        name: variableId,
        type: 'string',
        target,
      });
      externalKeyIds.set(variableId, keyId);
    }

    const fragment = createDocumentFragment();
    const dom = new DOMImplementation().createDocument(null, 'root', null);
    for (const key of keys.values()) {
      const keyElement = dom.createElement('key');
      keyElement.setAttribute('id', key.id);
      keyElement.setAttribute('attr.name', key.name);
      keyElement.setAttribute('attr.type', key.type);
      keyElement.setAttribute('for', key.target);
      fragment.appendChild(keyElement);
    }

    return { fragment, externalKeyIds };
  };
}
