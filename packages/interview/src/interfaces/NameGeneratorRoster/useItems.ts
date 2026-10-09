'use client';
import { invariant } from 'es-toolkit';
import { useCallback, useMemo } from 'react';

import type { LocalizedString } from '@codaco/protocol-validation';
import {
  type EntityPrimaryKey,
  entityPrimaryKeyProperty,
  type NcEntity,
  type NcNode,
} from '@codaco/shared-consts';

import useExternalData from '../../hooks/useExternalData';
import { useStageSelector } from '../../hooks/useStageSelector';
import { useResolveLocalizedString } from '../../localization/ProtocolLocalizationProvider';
import { useContentFormat } from '../../localization/useContentFormat';
import { getStageCardOptions } from '../../selectors/name-generator';
import {
  getNetworkNodes,
  getNodeTypeDefinition,
} from '../../selectors/session';
import getParentKeyByNameValue from '../../utils/getParentKeyByNameValue';
import { getEntityAttributes } from '../../utils/networkEntities';
import { resolveRosterNodeLabel } from '../../utils/resolveRosterNodeLabel';
import type { DataCardDetail } from './DataCard';
import type { NameGeneratorRosterProps } from './helpers';

/**
 * Format details needed for list cards
 */
const detailsWithVariableUUIDs =
  (props: {
    nodeTypeDefinition: ReturnType<typeof getNodeTypeDefinition>;
    visibleSupplementaryFields: ReturnType<
      typeof getStageCardOptions
    >['additionalProperties'];
    resolveText: (value: LocalizedString) => string;
  }) =>
  (node: NcNode): DataCardDetail[] | undefined => {
    const { nodeTypeDefinition, visibleSupplementaryFields, resolveText } =
      props;

    invariant(
      nodeTypeDefinition,
      'Node type definition is required to format details',
    );

    const nodeTypeVariables = nodeTypeDefinition.variables;
    const attrs = getEntityAttributes(node);
    const withUUIDReplacement = visibleSupplementaryFields?.map((field) => ({
      ...field,
      variable:
        getParentKeyByNameValue(nodeTypeVariables, field.variable) ??
        field.variable,
    }));

    return withUUIDReplacement?.map((field) => ({
      id: field.variable,
      label: resolveText(field.label),
      value: Object.hasOwn(attrs, field.variable)
        ? attrs[field.variable]
        : undefined,
    }));
  };

export type UseItemElement = {
  id: NcEntity[EntityPrimaryKey];
  data: NcNode;
  props: NameGeneratorRosterProps & {
    label: string;
    data: ReturnType<ReturnType<typeof detailsWithVariableUUIDs>>; // used for card display only
  };
};

// Returns all nodes associated with external data
const useItems = (props: NameGeneratorRosterProps) => {
  const { formatNumber } = useContentFormat();
  const resolve = useResolveLocalizedString();
  const nodeTypeDefinition = useStageSelector(getNodeTypeDefinition);
  const { externalData, status } = useExternalData(
    props.stage.dataSource,
    props.stage.subject,
  );
  const networkNodes = useStageSelector(getNetworkNodes);
  const cardOptions = useStageSelector(getStageCardOptions);

  const excludeItems = networkNodes.map(
    (item) => item[entityPrimaryKeyProperty],
  );

  // It is safe to ignore the encryption state here because this is external
  // data, meaning we do not expect it to be encrypted.
  // TODO: this must be updated if we want rosters to support encrypted data.
  const codebookVariables = nodeTypeDefinition?.variables;
  const subjectLabel = nodeTypeDefinition
    ? resolve(nodeTypeDefinition.label).text
    : '';
  const getNodeLabel = useCallback(
    (node: NcNode, sequentialNumber: number) =>
      resolveRosterNodeLabel({
        codebookVariables,
        formatNumber,
        node,
        subjectLabel,
        sequentialNumber,
      }),
    [codebookVariables, subjectLabel, formatNumber],
  );

  const items = useMemo(() => {
    if (!externalData) {
      return [] as UseItemElement[];
    }

    return externalData.map((item, index) => ({
      id: item[entityPrimaryKeyProperty],
      data: item,
      props: {
        label: getNodeLabel(item, index + 1),
        data: detailsWithVariableUUIDs({
          nodeTypeDefinition,
          visibleSupplementaryFields: cardOptions.additionalProperties,
          resolveText: (value) => resolve(value).text,
        })(item),
      },
    })) as UseItemElement[];
  }, [
    externalData,
    getNodeLabel,
    nodeTypeDefinition,
    cardOptions.additionalProperties,
    resolve,
  ]);

  return { status, items, excludeItems };
};

export default useItems;
