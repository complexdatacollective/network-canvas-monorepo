'use client';

import { useCallback, useMemo } from 'react';
import { useSelector } from 'react-redux';

import type { NodeTypeSortRule } from '@codaco/protocol-validation';
import type { NcNode } from '@codaco/shared-consts';

import {
  type EncryptedValue,
  readCachedOutcome,
} from '../interfaces/Anonymisation/decryptionScope';
import { useDecryptedScope } from '../interfaces/Anonymisation/useDecryptionScope';
import { useContentLocale } from '../localization/ProtocolLocalizationProvider';
import { makeGetCodebookVariablesForNodeType } from '../selectors/protocol';
import {
  type ProcessedSortRule,
  processProtocolSortRule,
} from '../utils/createSorter';
import { comparedEncryptedValues, sortNodes } from './useSortedNodeList';

/**
 * The nodes of a stage showing several node types, grouped by type and each
 * group sorted by its own rules.
 *
 * Groups follow `nodeTypeOrder`, or the stage's `subjectTypes` when the
 * prompt gives none; a node of a type neither lists comes last. Within a
 * group the rules whose `type` is the group's apply in list order, and nodes
 * they do not separate keep the order they came in.
 *
 * A rule's `type` is a node type, while the sorter reads `type` as the kind of
 * comparison it makes, so only `property` and `direction` are handed to the
 * sorter, resolved against the group's own variables.
 */
export default function useNodeTypeSortedList<T extends NcNode>(
  nodes: T[],
  rules: readonly NodeTypeSortRule[] | undefined,
  nodeTypeOrder: readonly string[] | undefined,
  subjectTypes: readonly string[],
): T[] {
  const variablesForType = useSelector(makeGetCodebookVariablesForNodeType);
  const locale = useContentLocale();

  const rulesByType = useMemo(() => {
    const byType = new Map<string, ProcessedSortRule[]>();
    for (const { type, property, direction } of rules ?? []) {
      const processed = processProtocolSortRule(variablesForType(type))({
        property,
        direction,
      });
      byType.set(type, [...(byType.get(type) ?? []), processed]);
    }
    return byType;
  }, [rules, variablesForType]);

  const values = useMemo(
    () =>
      [...rulesByType].flatMap(([type, typeRules]) =>
        comparedEncryptedValues(
          nodes.filter((node) => node.type === type),
          typeRules,
          variablesForType,
        ),
      ),
    [nodes, rulesByType, variablesForType],
  );
  const scope = useDecryptedScope(values);
  const outcomeOf = useCallback(
    (value: EncryptedValue) =>
      scope ? readCachedOutcome(scope, value) : undefined,
    [scope],
  );

  return useMemo(() => {
    const typeOrder = [
      ...new Set([
        ...(nodeTypeOrder ?? subjectTypes),
        ...nodes.map((node) => node.type),
      ]),
    ];
    return typeOrder.flatMap((type) =>
      sortNodes(
        nodes.filter((node) => node.type === type),
        rulesByType.get(type) ?? [],
        variablesForType,
        outcomeOf,
        locale,
      ),
    );
  }, [
    nodes,
    nodeTypeOrder,
    subjectTypes,
    rulesByType,
    variablesForType,
    outcomeOf,
    locale,
  ]);
}
