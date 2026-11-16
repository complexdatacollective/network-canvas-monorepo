import { createContext, useContext } from 'react';

import type { Codebook } from '@codaco/protocol-validation';

import { useProtocolContext } from '../state/protocolContext.ts';

const RuleCodebookContext = createContext<Readonly<Codebook> | undefined>(
  undefined,
);

/**
 * Gives the rule editors beneath it the codebook to build rules against, in
 * place of the open protocol's own. For a rule set outside a stage editor,
 * where there is no protocol read model to ask, and for one whose rules are
 * about fewer types than the protocol has: a node type's label condition is
 * asked of that one node type, so its editor is given a codebook holding
 * only that type among the nodes.
 */
export const RuleCodebookProvider = RuleCodebookContext.Provider;

/**
 * The codebook a rule editor builds its rules against: the one a
 * `RuleCodebookProvider` above it gives, or else the open protocol's.
 */
export function useRuleCodebook(): Readonly<Codebook> {
  const given = useContext(RuleCodebookContext);
  // Which of the two a rule editor reads is decided by where it is mounted,
  // and stays so for as long as it is: a provider is above it or it is not.
  // The protocol's read model throws outside a `ProtocolBuilder`, so it is
  // asked only where there is no codebook given.
  if (given !== undefined) return given;
  // oxlint-disable-next-line react-hooks/rules-of-hooks -- see above: the branch never changes between renders of one mounted editor
  return useProtocolContext().codebook;
}
