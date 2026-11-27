import { createSelector } from '@reduxjs/toolkit';

import {
  type CurrentProtocol,
  findRulesNamingLayout,
  getLayoutUsage,
} from '@codaco/protocol-validation';

import { getProtocol } from '../protocol';

type LayoutEntry = {
  id: string;
  name: string;
  /** Stages on which participants or the automatic layout place nodes in it. */
  setBy: string[];
  /** Stages that show the positions stored in it. */
  readBy: string[];
  /** Node types that a stage places in it. */
  nodeTypes: readonly string[];
  /** Stages with a rule (a filter, skip logic or a condition) that names it. */
  namedByRules: string[];
  /** Whether a stage or a rule names it, so it cannot be deleted. */
  inUse: boolean;
};

const unique = (ids: string[]) => [...new Set(ids)];

/** Each layout of the codebook, in codebook order, with what uses it. */
export const describeLayouts = (
  protocol: Pick<CurrentProtocol, 'codebook' | 'stages'>,
): LayoutEntry[] => {
  const usage = getLayoutUsage(protocol);
  return Object.entries(protocol.codebook.layouts ?? {}).map(
    ([id, { name }]) => {
      const entry = Object.hasOwn(usage, id) ? usage[id] : undefined;
      const setBy = unique((entry?.setBy ?? []).map((use) => use.stageId));
      const readBy = unique((entry?.readBy ?? []).map((use) => use.stageId));
      const namedByRules = unique(
        findRulesNamingLayout(protocol, id).map((rule) => rule.stageId),
      );
      return {
        id,
        name,
        setBy,
        readBy,
        nodeTypes: entry?.nodeTypes ?? [],
        namedByRules,
        inUse: setBy.length + readBy.length + namedByRules.length > 0,
      };
    },
  );
};

export const getLayoutEntries = createSelector([getProtocol], (protocol) =>
  protocol ? describeLayouts(protocol) : [],
);
