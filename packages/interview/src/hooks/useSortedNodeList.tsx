'use client';

import { useMemo } from 'react';
import { useSelector } from 'react-redux';

import type { SortRule } from '@codaco/protocol-validation';

import { useContentLocale } from '../localization/ProtocolLocalizationProvider';
import { getAllVariableUUIDsByEntity } from '../selectors/protocol';
import createSorter, { processProtocolSortRule } from '../utils/createSorter';

export default function useSortedNodeList<T extends Record<string, unknown>[]>(
  nodeList: T,
  sortRules?: SortRule[],
): T {
  const codebookVariables = useSelector(getAllVariableUUIDsByEntity);
  const ruleProcessor = processProtocolSortRule(codebookVariables);
  const locale = useContentLocale();

  const sortedNodeList = useMemo(() => {
    if (!sortRules || sortRules.length === 0) {
      return nodeList;
    }

    const sorter = createSorter(sortRules.map(ruleProcessor), locale);
    return sorter(nodeList);
  }, [nodeList, sortRules, ruleProcessor, locale]);

  return sortedNodeList as T;
}

// Version of the above that can be used in selectors without violating rules of hooks
export function getSortedNodeList<T extends Record<string, unknown>[]>(
  nodeList: T,
  sortRules: SortRule[] | undefined,
  codebookVariables: ReturnType<typeof getAllVariableUUIDsByEntity>,
  locale: string,
): T {
  if (!sortRules || sortRules.length === 0) {
    return nodeList;
  }

  const ruleProcessor = processProtocolSortRule(codebookVariables);
  const sorter = createSorter(sortRules.map(ruleProcessor), locale);
  return sorter(nodeList) as T;
}
