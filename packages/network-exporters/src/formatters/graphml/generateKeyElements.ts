import { DOMImplementation, type DocumentFragment } from '@xmldom/xmldom';

import type { Codebook, Variable } from '@codaco/protocol-validation';
import {
  type ExportColumnEntity,
  type ExportColumnOrigin,
  type NcEgo,
  categoricalOptionColumn,
  layoutColumn,
  toGraphMLAttrName,
  variableExportColumnEntries,
} from '@codaco/shared-consts';

import type { EdgeWithResequencedID, NodeWithResequencedID } from '../../input';
import type { ExportOptions } from '../../options';
import { isEncryptedAttribute } from '../../utils/encryptedAttribute';
import { getEntityAttributes, getOwn } from '../../utils/general';
import { resolveAttrNames } from './attrNames';
import { createDocumentFragment, getGraphMLTypeForKey, sha1 } from './helpers';
import {
  builtInKeys,
  createKeyIdAllocator,
  type GraphMLKeyIds,
  type GraphMLKeyTarget,
} from './keyIds';

type GraphMLEntitiesByKind = {
  ego: readonly NcEgo[];
  node: readonly NodeWithResequencedID[];
  edge: readonly EdgeWithResequencedID[];
};

type GraphMLEntity = GraphMLEntitiesByKind[ExportColumnEntity][number];

/** An ego, or one node or edge type, that a key is written for. */
type GraphMLKeyOwner = {
  readonly entity: ExportColumnEntity;
  readonly typeId?: string;
  /** The type's name, as the protocol has it. The ego has none. */
  readonly typeName?: string;
};

type GraphMLKey = {
  readonly identity: string;
  /** The id the key would have on its own; see `createKeyIdAllocator`. */
  readonly preferredId: string;
  /** The column name, as written. */
  readonly name: string;
  /** The variable, or undeclared attribute, the column belongs to. */
  readonly variable: string;
  readonly type: string;
  target: GraphMLKeyTarget;
  readonly builtIn: boolean;
  readonly owners: GraphMLKeyOwner[];
  /** Where each variable record this key is a column of keeps its key id. */
  readonly slots: { readonly variable: Variable; readonly index: number }[];
  readonly external?: string;
};

/**
 * A column the export gave a numbered `attr.name`, because another key would
 * have had the name it derives.
 */
type RenamedGraphMLColumn = {
  readonly entity: ExportColumnEntity;
  readonly entityTypeName?: string;
  readonly variable: string;
  readonly column: string;
  readonly renamedTo: string;
};

type GeneratedGraphMLKeys = {
  fragment: DocumentFragment;
  keyIds: GraphMLKeyIds;
  /**
   * The name, as written, of each key that holds session data: a variable or a
   * roster attribute. The keys every element has (label, type, UUID) are not
   * here, so a value in one of them is never mistaken for an answer.
   */
  variableKeyNames: ReadonlyMap<string, string>;
  renamedColumns: readonly RenamedGraphMLColumn[];
};

const ENTITY_KINDS = [
  'ego',
  'node',
  'edge',
] as const satisfies readonly ExportColumnEntity[];

const keyTargetOf = (entity: ExportColumnEntity): GraphMLKeyTarget =>
  entity === 'ego' ? 'graph' : entity;

const scopeOf = ({ entity, typeId }: GraphMLKeyOwner) =>
  entity === 'ego' ? entity : `${entity}:${typeId ?? ''}`;

// The ego, then each node type, then each edge type, in codebook order.
const getDeclaredTypes = (
  codebook: Codebook,
): { owner: GraphMLKeyOwner; variables: Record<string, Variable> }[] => [
  {
    owner: { entity: 'ego' },
    variables: codebook.ego?.variables ?? {},
  },
  ...(['node', 'edge'] as const).flatMap((entity) =>
    Object.entries(codebook[entity] ?? {}).map(([typeId, definition]) => ({
      owner: { entity, typeId, typeName: definition.name },
      variables: definition.variables ?? {},
    })),
  ),
];

const getCodebookVariables = (
  entityKind: ExportColumnEntity,
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

const getGraphMLTypeForVariable = (
  variable: Variable,
  variableId: string,
  entities: readonly GraphMLEntity[],
): string => {
  // The marker written in place of an encrypted value is text, whatever the
  // variable's own type.
  if (
    entities.some((entity) =>
      isEncryptedAttribute(entity, variableId, variable),
    )
  ) {
    return 'string';
  }
  switch (variable.type) {
    case 'boolean':
    case 'categorical':
      return 'boolean';
    case 'ordinal':
      return getGraphMLTypeForDeclaredVariable(
        entities,
        variableId,
        variable.options.length > 0 &&
          variable.options.every((option) => typeof option.value === 'number')
          ? 'int'
          : 'string',
      );
    case 'number':
      return getGraphMLTypeForDeclaredVariable(entities, variableId, 'double');
    case 'layout':
      return 'double';
    case 'scalar':
      return 'float';
    default:
      return 'string';
  }
};

const originIdentity = (origin: ExportColumnOrigin) => {
  switch (origin.kind) {
    case 'name':
      return [origin.kind];
    case 'option':
      return [origin.kind, typeof origin.value, String(origin.value)];
    case 'layout':
      return [origin.kind, origin.axis];
  }
};

const preferredVariableKeyId = async (
  variableId: string,
  origin: ExportColumnOrigin,
) => {
  switch (origin.kind) {
    case 'name':
      return variableId;
    case 'option':
      return categoricalOptionColumn(
        variableId,
        await sha1(String(origin.value)),
      );
    case 'layout':
      return layoutColumn('graphml', variableId, origin.axis);
  }
};

// GraphML declares a layout variable's screen-space keys between X and Y.
const LAYOUT_DECLARATION_ORDER = {
  x: 0,
  screenSpaceY: 1,
  screenSpaceX: 2,
  y: 3,
} as const;

const byDeclarationOrder = (
  a: { origin: ExportColumnOrigin; index: number },
  b: { origin: ExportColumnOrigin; index: number },
) =>
  a.origin.kind === 'layout' && b.origin.kind === 'layout'
    ? LAYOUT_DECLARATION_ORDER[a.origin.axis] -
      LAYOUT_DECLARATION_ORDER[b.origin.axis]
    : a.index - b.index;

const sameOwner = (a: GraphMLKeyOwner, b: GraphMLKeyOwner) =>
  a.entity === b.entity && a.typeId === b.typeId;

export default function getKeyElementGenerator(
  codebook: Codebook,
  exportOptions: ExportOptions,
) {
  return async (
    entitiesByKind: GraphMLEntitiesByKind,
  ): Promise<GeneratedGraphMLKeys> => {
    const keys = new Map<string, GraphMLKey>();

    const addKey = (
      key: Omit<GraphMLKey, 'owners' | 'slots'>,
      owner?: GraphMLKeyOwner,
      slot?: GraphMLKey['slots'][number],
    ) => {
      const existing = keys.get(key.identity);
      if (existing) {
        existing.target = mergeTargets(existing.target, key.target);
        if (owner && !existing.owners.some((each) => sameOwner(each, owner))) {
          existing.owners.push(owner);
        }
        if (slot) existing.slots.push(slot);
        return;
      }
      keys.set(key.identity, {
        ...key,
        owners: owner ? [owner] : [],
        slots: slot ? [slot] : [],
      });
    };

    for (const { id, type, target } of builtInKeys) {
      addKey({
        identity: JSON.stringify(['built-in', id]),
        preferredId: id,
        name: id,
        variable: id,
        type,
        target,
        builtIn: true,
      });
    }

    for (const { owner, variables } of getDeclaredTypes(codebook)) {
      const entities = entitiesByKind[owner.entity];
      for (const [variableId, variable] of Object.entries(variables)) {
        const entries = variableExportColumnEntries(variable, {
          format: 'graphml',
          useScreenLayoutCoordinates:
            exportOptions.globalOptions.useScreenLayoutCoordinates,
        });
        const type = getGraphMLTypeForVariable(variable, variableId, entities);
        const occurrences = new Map<string, number>();
        const columns = await Promise.all(
          entries.map(async ({ column, origin }, index) => {
            const originKey = JSON.stringify(originIdentity(origin));
            const occurrence = occurrences.get(originKey) ?? 0;
            occurrences.set(originKey, occurrence + 1);
            return {
              column,
              origin,
              index,
              identity: JSON.stringify([
                'variable',
                variableId,
                originKey,
                occurrence,
              ]),
              preferredId: await preferredVariableKeyId(variableId, origin),
            };
          }),
        );
        for (const { column, index, identity, preferredId } of columns.toSorted(
          byDeclarationOrder,
        )) {
          addKey(
            {
              identity,
              preferredId,
              name: column,
              variable: variable.name,
              type,
              target: keyTargetOf(owner.entity),
              builtIn: false,
            },
            owner,
            { variable, index },
          );
        }
      }
    }

    // Attributes an entity has that its type does not declare: roster
    // attributes, and values a protocol change left behind.
    const externalOwners = new Map<string, GraphMLKeyOwner[]>();
    for (const entityKind of ENTITY_KINDS) {
      for (const entity of entitiesByKind[entityKind]) {
        const codebookVariables = getCodebookVariables(
          entityKind,
          entity,
          codebook,
        );
        const typeId =
          'type' in entity && typeof entity.type === 'string'
            ? entity.type
            : undefined;
        const owner: GraphMLKeyOwner =
          entityKind === 'ego' || typeId === undefined
            ? { entity: entityKind }
            : {
                entity: entityKind,
                typeId,
                typeName: getOwn(codebook[entityKind], typeId)?.name ?? typeId,
              };

        for (const attribute of Object.keys(getEntityAttributes(entity))) {
          if (getOwn(codebookVariables, attribute)) continue;
          const owners = externalOwners.get(attribute);
          if (!owners) {
            externalOwners.set(attribute, [owner]);
          } else if (!owners.some((each) => sameOwner(each, owner))) {
            owners.push(owner);
          }
        }
      }
    }
    for (const attribute of [...externalOwners.keys()].toSorted()) {
      const owners = externalOwners.get(attribute) ?? [];
      const preferredId = await sha1(attribute);
      for (const owner of owners) {
        addKey(
          {
            identity: JSON.stringify(['external', attribute]),
            preferredId,
            name: attribute,
            variable: attribute,
            type: 'string',
            target: keyTargetOf(owner.entity),
            builtIn: false,
            external: attribute,
          },
          owner,
        );
      }
    }

    const allocator = createKeyIdAllocator(
      [...keys.values()].map(({ preferredId }) => preferredId),
    );
    const variableKeyIds = new Map<Variable, string[]>();
    const externalKeyIds = new Map<string, string>();
    const declared: (GraphMLKey & {
      readonly id: string;
      readonly scopes?: readonly string[];
    })[] = [];
    for (const key of keys.values()) {
      const id =
        key.external === undefined
          ? allocator.keyId(key.preferredId)
          : await allocator.externalKeyId(key.external, key.preferredId);
      declared.push({
        ...key,
        id,
        ...(key.builtIn ? {} : { scopes: key.owners.map(scopeOf) }),
      });
      if (key.external !== undefined) externalKeyIds.set(key.external, id);
      for (const { variable, index } of key.slots) {
        const ids = variableKeyIds.get(variable) ?? [];
        ids[index] = id;
        variableKeyIds.set(variable, ids);
      }
    }

    const fragment = createDocumentFragment();
    const dom = new DOMImplementation().createDocument(null, 'root', null);
    const attrNames = resolveAttrNames(declared);
    const renamedColumns: RenamedGraphMLColumn[] = [];
    for (const key of declared) {
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

      // Making a name an NMTOKEN is not a rename; numbering it is.
      const column = toGraphMLAttrName(key.name);
      if (!key.builtIn && attrName !== column) {
        for (const owner of key.owners) {
          renamedColumns.push({
            entity: owner.entity,
            ...(owner.typeName === undefined
              ? {}
              : { entityTypeName: owner.typeName }),
            variable: key.variable,
            column,
            renamedTo: attrName,
          });
        }
      }
    }

    return {
      fragment,
      keyIds: { variable: variableKeyIds, external: externalKeyIds },
      variableKeyNames: new Map(
        declared.filter((key) => !key.builtIn).map((key) => [key.id, key.name]),
      ),
      renamedColumns,
    };
  };
}
