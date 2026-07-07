import type { RelationshipType, VariableValue } from '@codaco/shared-consts';
import type {
  CommitBatch,
  GameteRole,
  VariableConfig,
} from '~/interfaces/FamilyPedigree/store';

import { buildChildParentage } from './buildChildParentage';
import { readBiologicalSex } from './personAttributes';

const KNOWN_BIO_PARENT_KEYS = new Set([
  'is-donor',
  'name',
  'gestationalCarrier',
  'biologicalSex',
]);

const KNOWN_ADDITIONAL_PARENT_KEYS = new Set(['role', 'name', 'biologicalSex']);

function extractUnknownAttributes(
  obj: Record<string, unknown>,
  knownKeys: Set<string>,
): Record<string, VariableValue> | undefined {
  const attrs: Record<string, VariableValue> = {};
  let hasAttrs = false;
  for (const [key, val] of Object.entries(obj)) {
    if (!knownKeys.has(key) && val !== undefined) {
      attrs[key] = val as VariableValue;
      hasAttrs = true;
    }
  }
  return hasAttrs ? attrs : undefined;
}

type ParentEntry = {
  tempId: string;
  attributes: Record<string, VariableValue>;
  relationshipType: Extract<
    RelationshipType,
    'biological' | 'donor' | 'surrogate' | 'social' | 'adoptive'
  >;
  isGestationalCarrier: boolean;
  gameteRole?: GameteRole;
};

function buildBioParent(
  key: string,
  parent: Record<string, unknown>,
  donorType: 'donor' | 'surrogate',
  variableConfig: VariableConfig,
  includeBiologicalSex: boolean,
): ParentEntry {
  const isDonor = parent['is-donor'] === true;
  const name = (parent.name as string | undefined) ?? '';
  const extraAttrs = extractUnknownAttributes(parent, KNOWN_BIO_PARENT_KEYS);

  const attributes: Record<string, VariableValue> = {
    [variableConfig.nodeLabelVariable]: name,
    [variableConfig.egoVariable]: false,
    ...extraAttrs,
  };

  if (includeBiologicalSex) {
    const sex = readBiologicalSex(parent.biologicalSex);
    if (sex !== undefined) {
      attributes[variableConfig.biologicalSexVariable] = [sex];
    }
  }

  return {
    tempId: key,
    attributes,
    relationshipType: isDonor ? donorType : 'biological',
    isGestationalCarrier: false,
  };
}

function buildAdditionalParent(
  index: number,
  parent: Record<string, unknown>,
  variableConfig: VariableConfig,
): ParentEntry {
  const extraAttrs = extractUnknownAttributes(
    parent,
    KNOWN_ADDITIONAL_PARENT_KEYS,
  );

  const attributes: Record<string, VariableValue> = {
    [variableConfig.nodeLabelVariable]:
      (parent.name as string | undefined) ?? '',
    [variableConfig.egoVariable]: false,
    ...extraAttrs,
  };

  const sex = readBiologicalSex(parent.biologicalSex);
  if (sex !== undefined) {
    attributes[variableConfig.biologicalSexVariable] = [sex];
  }

  return {
    tempId: `additional-parent-${String(index)}`,
    attributes,
    relationshipType: parent.role === 'adoptive-parent' ? 'adoptive' : 'social',
    isGestationalCarrier: false,
  };
}

export type EgoCellResult = {
  batch: CommitBatch;
  egoAttributes?: Record<string, VariableValue>;
};

export function egoCellTransform(
  values: Record<string, unknown>,
  variableConfig: VariableConfig,
  existingEgoId?: string,
): EgoCellResult {
  const eggParent = values['egg-parent'] as Record<string, unknown> | undefined;
  const spermParent = values['sperm-parent'] as
    | Record<string, unknown>
    | undefined;
  const gestCarrier = values['gestational-carrier'] as
    | Record<string, unknown>
    | undefined;

  const parents: ParentEntry[] = [];

  if (eggParent) {
    const entry = buildBioParent(
      'egg-parent',
      eggParent,
      'donor',
      variableConfig,
      false,
    );
    entry.gameteRole = 'egg';
    if (eggParent.gestationalCarrier === true) {
      entry.isGestationalCarrier = true;
    }
    parents.push(entry);
  }

  if (spermParent) {
    const entry = buildBioParent(
      'sperm-parent',
      spermParent,
      'donor',
      variableConfig,
      false,
    );
    entry.gameteRole = 'sperm';
    parents.push(entry);
  }

  const hasGestCarrier = eggParent?.gestationalCarrier === false && gestCarrier;
  if (hasGestCarrier) {
    const entry = buildBioParent(
      'gestational-carrier',
      gestCarrier,
      'surrogate',
      variableConfig,
      true,
    );
    // A gestational carrier never contributes the egg, so they are never a
    // genetic parent — always record them as a (non-genetic) surrogate.
    entry.relationshipType = 'surrogate';
    entry.isGestationalCarrier = true;
    parents.push(entry);
  }

  const additionalParents = values['additional-parent'] as
    | Record<string, unknown>[]
    | undefined;
  if (values.hasOtherParents === true && Array.isArray(additionalParents)) {
    for (let i = 0; i < additionalParents.length; i++) {
      const ap = additionalParents[i];
      if (ap) {
        parents.push(buildAdditionalParent(i, ap, variableConfig));
      }
    }
  }

  const egoRef = existingEgoId ?? 'ego';
  const batch: CommitBatch = { nodes: [], edges: [] };

  const egoKnownKeys = new Set([
    'biologicalSex',
    'egg-parent',
    'sperm-parent',
    'gestational-carrier',
    'hasOtherParents',
    'otherParentCount',
    'additional-parent',
    'hasPartner',
    'partner',
    'childrenWithPartnerCount',
    'childWithPartner',
    'partnerships',
  ]);
  const egoCustomAttrs: Record<string, VariableValue> = {};
  for (const [key, val] of Object.entries(values)) {
    if (!egoKnownKeys.has(key) && val !== undefined) {
      egoCustomAttrs[key] = val as VariableValue;
    }
  }

  const egoAttributes: Record<string, VariableValue> = {
    [variableConfig.nodeLabelVariable]: '',
    [variableConfig.egoVariable]: true,
    ...egoCustomAttrs,
  };
  // Ego is a leaf/proband with no parent edges, so its sex cannot be inferred
  // from a gameteRole — it must be captured and stored, or ego drops out of its
  // own sex-linked risk calculation.
  const egoSex = readBiologicalSex(values.biologicalSex);
  if (egoSex !== undefined) {
    egoAttributes[variableConfig.biologicalSexVariable] = [egoSex];
  }

  if (!existingEgoId) {
    batch.nodes.push({
      tempId: 'ego',
      data: {
        attributes: egoAttributes,
      },
    });
  }

  for (const parent of parents) {
    batch.nodes.push({
      tempId: parent.tempId,
      data: { attributes: parent.attributes },
    });

    const edgeAttributes: Record<string, VariableValue> = {
      [variableConfig.relationshipTypeVariable]: [parent.relationshipType],
      [variableConfig.isActiveVariable]: true,
    };
    if (parent.isGestationalCarrier) {
      edgeAttributes[variableConfig.isGestationalCarrierVariable] = true;
    }
    if (parent.gameteRole) {
      edgeAttributes[variableConfig.gameteRoleVariable] = [parent.gameteRole];
    }

    batch.edges.push({
      source: parent.tempId,
      target: egoRef,
      data: { attributes: edgeAttributes },
    });
  }

  // Parse partnership matrices: `values.partnerships` maps each focal parent's
  // tempId to an array of { id, value } entries — one per candidate partner
  // listed below it (each pair is asked exactly once).
  const partnerships = values.partnerships as
    | Record<string, { id: string; value: string }[]>
    | undefined;
  if (partnerships) {
    // A partnership matrix can retain rows for parents that were later removed
    // (e.g. additional parents after toggling "other parents" off). Only emit
    // edges between parents that were actually materialized as nodes.
    const materializedIds = new Set(batch.nodes.map((node) => node.tempId));
    for (const [focalId, matrix] of Object.entries(partnerships)) {
      if (!Array.isArray(matrix)) continue;
      for (const entry of matrix) {
        if (
          (entry?.value === 'current' || entry?.value === 'ex') &&
          materializedIds.has(focalId) &&
          materializedIds.has(entry.id)
        ) {
          batch.edges.push({
            source: focalId,
            target: entry.id,
            data: {
              attributes: {
                [variableConfig.relationshipTypeVariable]: ['partner'],
                [variableConfig.isActiveVariable]: entry.value === 'current',
              },
            },
          });
        }
      }
    }
  }

  // Partner
  const hasPartner = values.hasPartner === true;
  const partnerObj = values.partner as Record<string, unknown> | undefined;

  if (hasPartner && partnerObj) {
    const partnerName = (partnerObj.name as string | undefined) ?? '';
    const partnerExtraAttrs = extractUnknownAttributes(
      partnerObj,
      KNOWN_BIO_PARENT_KEYS,
    );

    const partnerAttrs: Record<string, VariableValue> = {
      [variableConfig.nodeLabelVariable]: partnerName,
      [variableConfig.egoVariable]: false,
      ...partnerExtraAttrs,
    };
    const partnerSex = readBiologicalSex(partnerObj.biologicalSex);
    if (partnerSex !== undefined) {
      partnerAttrs[variableConfig.biologicalSexVariable] = [partnerSex];
    }

    batch.nodes.push({
      tempId: 'partner',
      data: { attributes: partnerAttrs },
    });

    batch.edges.push({
      source: egoRef,
      target: 'partner',
      data: {
        attributes: {
          [variableConfig.relationshipTypeVariable]: ['partner'],
          [variableConfig.isActiveVariable]: true,
        },
      },
    });
  }

  // Children with partner — each child's biological parentage is captured per
  // child via the BioTriad model (egg/sperm/carrier), namespaced under
  // `childWithPartner[i].parentage`. The partner is only a parent of a child if
  // the participant selected them as the egg or sperm source.
  const childrenCount = hasPartner
    ? Number(values.childrenWithPartnerCount ?? 0)
    : 0;
  const childrenArray = values.childWithPartner as
    | Record<string, unknown>[]
    | undefined;

  for (let i = 0; i < childrenCount; i++) {
    const child = childrenArray?.[i];
    if (!child) continue;

    const childName = (child.name as string | undefined) ?? '';
    const childExtraAttrs = extractUnknownAttributes(
      child,
      new Set(['name', 'parentage', 'biologicalSex']),
    );
    const tempId = `child-${String(i)}`;

    const childAttrs: Record<string, VariableValue> = {
      [variableConfig.nodeLabelVariable]: childName,
      [variableConfig.egoVariable]: false,
      ...childExtraAttrs,
    };
    const childSex = readBiologicalSex(child.biologicalSex);
    if (childSex !== undefined) {
      childAttrs[variableConfig.biologicalSexVariable] = [childSex];
    }

    batch.nodes.push({
      tempId,
      data: { attributes: childAttrs },
    });

    const triadValues = {
      ...((child.parentage ?? {}) as Record<string, unknown>),
    };
    // The children step uses the literal 'ego' for the participant in any role
    // (egg, sperm, or carrier); map it to the actual ego reference (a
    // pre-existing ego id when revisiting).
    for (const role of [
      'egg-source',
      'sperm-source',
      'carrier-source',
    ] as const) {
      if (triadValues[role] === 'ego') triadValues[role] = egoRef;
    }
    const { nodes: parentNodes, edges: parentEdges } = buildChildParentage(
      tempId,
      triadValues,
      variableConfig,
    );
    batch.nodes.push(...parentNodes);
    batch.edges.push(...parentEdges);
  }

  return {
    batch,
    ...(existingEgoId ? { egoAttributes } : {}),
  };
}
