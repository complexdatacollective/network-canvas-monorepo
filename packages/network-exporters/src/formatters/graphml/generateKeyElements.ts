import { DOMImplementation, type DocumentFragment } from '@xmldom/xmldom';

import type { Codebook, Variable } from '@codaco/protocol-validation';
import {
  type NcEgo,
  categoricalOptionColumn,
  layoutColumn,
} from '@codaco/shared-consts';

import type { EdgeWithResequencedID, NodeWithResequencedID } from '../../input';
import type { ExportOptions } from '../../options';
import { getEntityAttributes, getOwn } from '../../utils/general';
import { resolveAttrNames } from './attrNames';
import { createDocumentFragment, getGraphMLTypeForKey, sha1 } from './helpers';
import {
  allocateVariableKeyIds,
  builtInKeys,
  type GraphMLKeyIds,
  type GraphMLKeyTarget,
} from './keyIds';

type GraphMLEntityKind = 'ego' | 'node' | 'edge';

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
  builtIn: boolean;
};

type GeneratedGraphMLKeys = {
  fragment: DocumentFragment;
  keyIds: GraphMLKeyIds;
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

  return getOwn(codebook[entityKind], entity.type)?.variables ?? {};
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
    (entity) => getOwn(getEntityAttributes(entity), variableId) !== undefined,
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
    const variableKeyIds = allocateVariableKeyIds(codebook);

    const addKey = (key: GraphMLKey) => {
      const existing = keys.get(key.id);
      if (existing) {
        existing.target = mergeTargets(existing.target, key.target);
        return;
      }

      keys.set(key.id, key);
      reservedKeyIds.add(key.id);
    };

    for (const { id, type, target } of builtInKeys) {
      addKey({ id, name: id, type, target, builtIn: true });
    }

    const addVariableKeys = async (
      entityKind: GraphMLEntityKind,
      variableId: string,
      variable: Variable,
    ) => {
      const keyName = variable.name;
      const keyId = variableKeyIds.get(variableId) ?? variableId;
      const keyTarget = entityKind === 'ego' ? 'graph' : entityKind;
      const entities = entitiesByKind[entityKind];

      switch (variable.type) {
        case 'boolean':
          addKey({
            id: keyId,
            name: keyName,
            type: 'boolean',
            target: keyTarget,
            builtIn: false,
          });
          break;
        case 'ordinal':
          addKey({
            id: keyId,
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
            builtIn: false,
          });
          break;
        case 'number':
          addKey({
            id: keyId,
            name: keyName,
            type: getGraphMLTypeForDeclaredVariable(
              entities,
              variableId,
              'double',
            ),
            target: keyTarget,
            builtIn: false,
          });
          break;
        case 'layout': {
          // GraphML declares the screen-space keys between X and Y.
          const axes = exportOptions.globalOptions.useScreenLayoutCoordinates
            ? (['x', 'screenSpaceY', 'screenSpaceX', 'y'] as const)
            : (['x', 'y'] as const);
          for (const axis of axes) {
            addKey({
              id: layoutColumn('graphml', variableId, axis),
              name: layoutColumn('graphml', keyName, axis),
              type: 'double',
              target: keyTarget,
              builtIn: false,
            });
          }
          break;
        }
        case 'categorical': {
          const hashedOptionValues = await Promise.all(
            variable.options.map((option) => sha1(String(option.value))),
          );
          variable.options.forEach((option, index) => {
            const hashedOptionValue = hashedOptionValues[index];
            if (hashedOptionValue) {
              addKey({
                id: categoricalOptionColumn(variableId, hashedOptionValue),
                name: categoricalOptionColumn(keyName, option.value),
                type: 'boolean',
                target: keyTarget,
                builtIn: false,
              });
            }
          });
          break;
        }
        case 'scalar':
          addKey({
            id: keyId,
            name: keyName,
            type: 'float',
            target: keyTarget,
            builtIn: false,
          });
          break;
        default:
          addKey({
            id: keyId,
            name: keyName,
            type: 'string',
            target: keyTarget,
            builtIn: false,
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
          if (getOwn(codebookVariables, variableId)) {
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
        builtIn: false,
      });
      externalKeyIds.set(variableId, keyId);
    }

    const fragment = createDocumentFragment();
    const dom = new DOMImplementation().createDocument(null, 'root', null);
    const attrNames = resolveAttrNames([...keys.values()]);
    for (const key of keys.values()) {
      const attrName = attrNames.get(key) ?? key.name;
      const keyElement = dom.createElement('key');
      keyElement.setAttribute('id', key.id);
      keyElement.setAttribute('attr.name', attrName);
      keyElement.setAttribute('attr.type', key.type);
      keyElement.setAttribute('for', key.target);
      if (attrName !== key.name) {
        // `attr.name` is an xs:NMTOKEN, so the name as written is kept here.
        const description = dom.createElement('desc');
        description.appendChild(dom.createTextNode(key.name));
        keyElement.appendChild(description);
      }
      fragment.appendChild(keyElement);
    }

    return {
      fragment,
      keyIds: { variable: variableKeyIds, external: externalKeyIds },
    };
  };
}
